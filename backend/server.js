const express = require("express");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// MIDDLEWARE
// ===============================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// FILES
// ===============================

const DATA_DIR = __dirname;

const USERS_FILE = path.join(DATA_DIR, "users.json");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const SUPPORT_FILE = path.join(DATA_DIR, "support.json");
const WITHDRAW_FILE = path.join(DATA_DIR, "withdrawals.json");

// ===============================
// SETTINGS
// ===============================

const TASK_REWARD = 35;
const TASK_XP = 15;
const LEVEL_BONUS = 1;

// Level 0 starts with 0 XP.
// Level 0 → Level 1 = 25 XP
// Level 1 → Level 2 = 50 XP
// Level 2 → Level 3 = 75 XP
// etc.

function requiredXP(level) {
    return (Number(level) + 1) * 25;
}

// ===============================
// HELPERS
// ===============================

function ensureFile(file, fallback = []) {

    if (!fs.existsSync(file)) {

        fs.writeFileSync(
            file,
            JSON.stringify(fallback, null, 2),
            "utf8"
        );

    }
}

function readJSON(file, fallback = []) {

    try {

        ensureFile(file, fallback);

        const data =
            fs.readFileSync(file, "utf8");

        if (!data.trim()) {
            return fallback;
        }

        return JSON.parse(data);

    } catch (error) {

        console.log(
            "JSON read error:",
            file,
            error.message
        );

        return fallback;
    }
}

function writeJSON(file, data) {

    try {

        fs.writeFileSync(
            file,
            JSON.stringify(data, null, 2),
            "utf8"
        );

        return true;

    } catch (error) {

        console.log(
            "JSON write error:",
            error.message
        );

        return false;
    }
}

function clean(value) {

    return String(
        value ?? ""
    ).trim();
}

function safeUser(user) {

    if (!user) {
        return null;
    }

    const result = {
        ...user
    };

    delete result.password;

    return result;
}

// ===============================
// INITIAL FILES
// ===============================

ensureFile(USERS_FILE, []);
ensureFile(TASKS_FILE, []);
ensureFile(SUPPORT_FILE, []);
ensureFile(WITHDRAW_FILE, []);

// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {

    res.json({

        success: true,

        name: "FT TRADE",

        message:
            "FT TRADE server is running.",

        port: PORT
    });
});

// ===============================
// SIGNUP
// ===============================

app.post("/api/signup", async (req, res) => {

    try {

        const name =
            clean(req.body.name);

        const email =
            clean(req.body.email)
            .toLowerCase();

        const password =
            clean(req.body.password);

        if (
            !name ||
            !email ||
            !password
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "All fields are required."
            });
        }

        if (!email.includes("@")) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid email."
            });
        }

        if (password.length < 6) {

            return res.status(400).json({

                success: false,

                message:
                    "Password must contain at least 6 characters."
            });
        }

        const users =
            readJSON(
                USERS_FILE,
                []
            );

        const exists =
            users.find(
                user =>
                    String(user.email)
                    .toLowerCase() === email
            );

        if (exists) {

            return res.status(409).json({

                success: false,

                message:
                    "Email is already registered."
            });
        }

        const hashedPassword =
            await bcrypt.hash(
                password,
                12
            );

        const user = {

            id:
                "FT" +
                Date.now()
                .toString()
                .slice(-8),

            name,

            email,
          referredBy:
    null,

referralRewardPaid:
    false,

            password:
                hashedPassword,

            balance: 0,

            xp: 0,

            level: 0,

            completedTasks: 0,

            status:
                "active",

            createdAt:
                new Date()
                .toISOString()
        };

        users.push(user);

        if (
            !writeJSON(
                USERS_FILE,
                users
            )
        ) {

            return res.status(500).json({

                success: false,

                message:
                    "Unable to save account."
            });
        }

        return res.status(201).json({

            success: true,

            message:
                "Account created successfully.",

            user:
                safeUser(user)
        });

    } catch (error) {

        console.log(
            "Signup error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Server error."
        });
    }
});

// ===============================
// LOGIN
// ===============================

app.post("/api/login", async (req, res) => {

    try {

        const email =
            clean(req.body.email)
            .toLowerCase();

        const password =
            clean(req.body.password);
      const referralCode =
    clean(req.body.referralCode);

        if (
            !email ||
            !password
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Email and password are required."
            });
        }

        const users =
            readJSON(
                USERS_FILE,
                []
            );

        const index =
            users.findIndex(
                user =>
                    String(user.email)
                    .toLowerCase() === email
            );

        if (index === -1) {

            return res.status(401).json({

                success: false,

                message:
                    "Invalid email or password."
            });
        }

        const user =
            users[index];

        let correct = false;

        if (
            String(user.password)
            .startsWith("$2")
        ) {

            correct =
                await bcrypt.compare(
                    password,
                    user.password
                );

        } else {

            correct =
                String(user.password) ===
                password;

            if (correct) {

                user.password =
                    await bcrypt.hash(
                        password,
                        12
                    );

                users[index] =
                    user;

                writeJSON(
                    USERS_FILE,
                    users
                );
            }
        }

        if (!correct) {

            return res.status(401).json({

                success: false,

                message:
                    "Invalid email or password."
            });
        }

        // Repair old accounts
        if (
            user.level === undefined ||
            user.level === null
        ) {
            user.level = 0;
        }

        if (
            user.xp === undefined ||
            user.xp === null
        ) {
            user.xp = 0;
        }

        if (
            user.balance === undefined ||
            user.balance === null
        ) {
            user.balance = 0;
        }

        users[index] =
            user;

        writeJSON(
            USERS_FILE,
            users
        );

        return res.json({

            success: true,

            message:
                "Login successful.",

            user:
                safeUser(user)
        });

    } catch (error) {

        console.log(
            "Login error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Server error."
        });
    }
});

// ===============================
// GET USER
// ===============================

app.get("/api/user/:id", (req, res) => {

    try {

        const id =
            clean(req.params.id);

        const users =
            readJSON(
                USERS_FILE,
                []
            );

        const user =
            users.find(
                item =>
                    String(item.id) === id
            );

        if (!user) {

            return res.status(404).json({

                success: false,

                message:
                    "User not found."
            });
        }

        return res.json({

            success: true,

            user:
                safeUser(user)
        });

    } catch (error) {

        console.log(
            "Get user error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Server error."
        });
    }
});

// ===============================
// CHANGE PASSWORD
// ===============================

app.post(
    "/api/change-password",
    async (req, res) => {

        try {

            const userId =
                clean(req.body.userId);

            const currentPassword =
                clean(req.body.currentPassword);

            const newPassword =
                clean(req.body.newPassword);

            if (
                !userId ||
                !currentPassword ||
                !newPassword
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "All password fields are required."
                });
            }

            if (newPassword.length < 6) {

                return res.status(400).json({

                    success: false,

                    message:
                        "New password must contain at least 6 characters."
                });
            }

            const users =
                readJSON(
                    USERS_FILE,
                    []
                );

            const index =
                users.findIndex(
                    user =>
                        String(user.id) ===
                        userId
                );

            if (index === -1) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found."
                });
            }

            const user =
                users[index];

            let correct = false;

            if (
                String(user.password)
                .startsWith("$2")
            ) {

                correct =
                    await bcrypt.compare(
                        currentPassword,
                        user.password
                    );

            } else {

                correct =
                    String(user.password) ===
                    currentPassword;
            }

            if (!correct) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Current password is incorrect."
                });
            }

            users[index].password =
                await bcrypt.hash(
                    newPassword,
                    12
                );

            writeJSON(
                USERS_FILE,
                users
            );

            return res.json({

                success: true,

                message:
                    "Password changed successfully."
            });

        } catch (error) {

            console.log(
                "Password error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);
// ======================================================
// TASK SYSTEM
// ======================================================

// GET ACTIVE TASK
app.get("/api/tasks", (req, res) => {

    try {

        const tasks =
            readJSON(TASKS_FILE, []);

        const activeTask =
            tasks.find(
                task =>
                    task.status === "active"
            );

        if (!activeTask) {

            return res.json({

                success: true,

                task: {

                    id:
                        "FT-TASK-001",

                    title:
                        "Gmail Task",

                    reward:
                        TASK_REWARD,

                    xp:
                        TASK_XP,

                    currency:
                        "PKR",

                    status:
                        "active",

                    description:
                        "Submit your Gmail for the assigned task."
                }
            });
        }

        return res.json({

            success: true,

            task:
                activeTask
        });

    } catch (error) {

        console.log(
            "Get task error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Server error."
        });
    }
});


// ======================================================
// SUBMIT GMAIL TASK
// ======================================================

app.post("/api/tasks/submit", (req, res) => {

    try {

        const userId =
            clean(req.body.userId);

        const email =
            clean(req.body.email)
            .toLowerCase();

        if (!userId || !email) {

            return res.status(400).json({

                success: false,

                message:
                    "User ID and Gmail are required."
            });
        }

        if (!email.includes("@")) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter a valid Gmail."
            });
        }

        // ------------------------------------------------
        // CHECK USER
        // ------------------------------------------------

        const users =
            readJSON(
                USERS_FILE,
                []
            );

        const user =
            users.find(
                item =>
                    String(item.id) ===
                    String(userId)
            );

        if (!user) {

            return res.status(404).json({

                success: false,

                message:
                    "User not found."
            });
        }

        // ------------------------------------------------
        // GET SUBMISSIONS
        // ------------------------------------------------

        const submissions =
            readJSON(
                TASKS_FILE,
                []
            );

        // ------------------------------------------------
        // DUPLICATE GMAIL CHECK
        // ------------------------------------------------

        const alreadySubmitted =
            submissions.some(
                task => {

                    const oldEmail =
                        String(
                            task.email || ""
                        )
                        .trim()
                        .toLowerCase();

                    return oldEmail === email;
                }
            );

        if (alreadySubmitted) {

            return res.status(409).json({

                success: false,

                duplicate: true,

                message:
                    "This Gmail has already been submitted."
            });
        }

        // ------------------------------------------------
        // CREATE SUBMISSION
        // ------------------------------------------------

        const submission = {

            id:
                "SUB" +
                Date.now(),

            userId:
                userId,

            email:
                email,

            reward:
                TASK_REWARD,

            xp:
                TASK_XP,

            status:
                "pending",

            createdAt:
                new Date()
                .toISOString()
        };

        submissions.push(
            submission
        );

        const saved =
            writeJSON(
                TASKS_FILE,
                submissions
            );

        if (!saved) {

            return res.status(500).json({

                success: false,

                message:
                    "Unable to save task."
            });
        }

        return res.status(201).json({

            success: true,

            message:
                "Gmail task submitted successfully.",

            submission:
                submission
        });

    } catch (error) {

        console.log(
            "Submit task error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Server error."
        });
    }
});


// ======================================================
// TASK HISTORY
// ======================================================

app.get(
    "/api/tasks/history/:userId",
    (req, res) => {

        try {

            const userId =
                clean(req.params.userId);

            if (!userId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "User ID is required."
                });
            }

            const submissions =
                readJSON(
                    TASKS_FILE,
                    []
                );

            const history =
                submissions.filter(
                    task =>
                        String(task.userId) ===
                        String(userId)
                );

            return res.json({

                success: true,

                submissions:
                    history
            });

        } catch (error) {

            console.log(
                "Task history error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// USER LEVEL / XP INFO
// ======================================================

app.get(
    "/api/user/:id/progress",
    (req, res) => {

        try {

            const id =
                clean(req.params.id);

            const users =
                readJSON(
                    USERS_FILE,
                    []
                );

            const user =
                users.find(
                    item =>
                        String(item.id) === id
                );

            if (!user) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found."
                });
            }

            const level =
                Number(user.level) || 0;

            const xp =
                Number(user.xp) || 0;

            const needed =
                requiredXP(level);

            const percent =
                Math.min(
                    100,
                    Math.max(
                        0,
                        Math.round(
                            (xp / needed) * 100
                        )
                    )
                );

            return res.json({

                success: true,

                level:
                    level,

                xp:
                    xp,

                requiredXP:
                    needed,

                percent:
                    percent,

                nextLevel:
                    level + 1
            });

        } catch (error) {

            console.log(
                "Progress error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// SUPPORT — GET MESSAGES
// ======================================================

app.get(
    "/api/support/:userId",
    (req, res) => {

        try {

            const userId =
                clean(req.params.userId);

            if (!userId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "User ID is required."
                });
            }

            const messages =
                readJSON(
                    SUPPORT_FILE,
                    []
                );

            const userMessages =
                messages.filter(
                    message =>
                        String(message.userId) ===
                        String(userId)
                );

            return res.json({

                success: true,

                messages:
                    userMessages
            });

        } catch (error) {

            console.log(
                "Support GET error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// SUPPORT — SEND MESSAGE
// ======================================================

app.post(
    "/api/support",
    (req, res) => {

        try {

            const userId =
                clean(req.body.userId);

            const message =
                clean(req.body.message);

            if (!userId || !message) {

                return res.status(400).json({

                    success: false,

                    message:
                        "User ID and message are required."
                });
            }

            const messages =
                readJSON(
                    SUPPORT_FILE,
                    []
                );

            const newMessage = {

                id:
                    "MSG" +
                    Date.now(),

                userId:
                    userId,

                message:
                    message,

                sender:
                    "user",

                createdAt:
                    new Date()
                    .toISOString()
            };

            messages.push(
                newMessage
            );

            writeJSON(
                SUPPORT_FILE,
                messages
            );

            return res.status(201).json({

                success: true,

                message:
                    "Message sent.",

                data:
                    newMessage
            });

        } catch (error) {

            console.log(
                "Support POST error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);
// ======================================================
// WITHDRAW — CREATE REQUEST
// ======================================================

app.post("/api/withdraw", (req, res) => {

    try {

        const userId =
            clean(req.body.userId);

        const amount =
            Number(req.body.amount);

        const method =
            clean(req.body.method);

        const account =
            clean(req.body.account);

        if (
            !userId ||
            !amount ||
            !method ||
            !account
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "All withdrawal fields are required."
            });
        }

        if (amount <= 0) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid withdrawal amount."
            });
        }

        const users =
            readJSON(
                USERS_FILE,
                []
            );

        const userIndex =
            users.findIndex(
                user =>
                    String(user.id) ===
                    String(userId)
            );

        if (userIndex === -1) {

            return res.status(404).json({

                success: false,

                message:
                    "User not found."
            });
        }

        const user =
            users[userIndex];

        const balance =
            Number(user.balance) || 0;

        if (amount > balance) {

            return res.status(400).json({

                success: false,

                message:
                    "Insufficient balance."
            });
        }

        const withdrawals =
            readJSON(
                WITHDRAW_FILE,
                []
            );

        const accountHolder =
    clean(req.body.accountHolder);

const bankName =
    clean(req.body.bankName);

const request = {

    id:
        "WD" +
        Date.now(),

    userId:
        userId,

    name:
        user.name,

    email:
        user.email,

    amount:
        amount,

    method:
        method,

    account:
        account,

    accountHolder:
        accountHolder,

    bankName:
        bankName,

    status:
        "pending",

    createdAt:
        new Date()
        .toISOString()
};
        withdrawals.push(request);
        // Balance is held until admin decision
        user.balance =
            balance - amount;

        users[userIndex] =
            user;

        writeJSON(
            USERS_FILE,
            users
        );

        writeJSON(
            WITHDRAW_FILE,
            withdrawals
        );

        return res.status(201).json({

            success: true,

            message:
                "Withdrawal request submitted.",

            withdrawal:
                request,

            user:
                safeUser(user)
        });

    } catch (error) {

        console.log(
            "Withdraw error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Server error."
        });
    }
});


// ======================================================
// WITHDRAW — USER HISTORY
// ======================================================

app.get(
    "/api/withdrawals/:userId",
    (req, res) => {

        try {

            const userId =
                clean(req.params.userId);

            const withdrawals =
                readJSON(
                    WITHDRAW_FILE,
                    []
                );

            const history =
                withdrawals.filter(
                    item =>
                        String(item.userId) ===
                        String(userId)
                );

            return res.json({

                success: true,

                withdrawals:
                    history
            });

        } catch (error) {

            console.log(
                "Withdrawal history error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// ADMIN — GET USERS
// ======================================================

app.get(
    "/api/admin/users",
    (req, res) => {

        try {

            const users =
                readJSON(
                    USERS_FILE,
                    []
                );

            return res.json({

                success: true,

                users:
                    users.map(
                        safeUser
                    )
            });

        } catch (error) {

            console.log(
                "Admin users error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// ADMIN — GET TASKS
// ======================================================

app.get(
    "/api/admin/tasks",
    (req, res) => {

        try {

            const tasks =
                readJSON(
                    TASKS_FILE,
                    []
                );

            return res.json({

                success: true,

                tasks:
                    tasks
            });

        } catch (error) {

            console.log(
                "Admin tasks error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// ADMIN — TASK APPROVAL
// ======================================================

app.post(
    "/api/admin/tasks/status",
    (req, res) => {

        try {

            const id =
                clean(req.body.id);

            const status =
                clean(req.body.status);

            if (
                !id ||
                !status
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "ID and status required."
                });
            }

            if (
                ![
                    "pending",
                    "approved",
                    "rejected"
                ].includes(status)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid status."
                });
            }

            const tasks =
                readJSON(
                    TASKS_FILE,
                    []
                );

            const taskIndex =
                tasks.findIndex(
                    task =>
                        String(task.id) ===
                        String(id)
                );

            if (taskIndex === -1) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Task not found."
                });
            }

            const task =
                tasks[taskIndex];

            // ==========================================
            // APPROVE ONLY ONCE
            // ==========================================

            if (
                status === "approved" &&
                task.status !== "approved"
            ) {

                const users =
                    readJSON(
                        USERS_FILE,
                        []
                    );

                const userIndex =
                    users.findIndex(
                        user =>
                            String(user.id) ===
                            String(task.userId)
                    );

                if (userIndex === -1) {

                    return res.status(404).json({

                        success: false,

                        message:
                            "Task owner not found."
                    });
                }

                const user =
                    users[userIndex];

                const oldXP =
                    Number(user.xp) || 0;

                const oldLevel =
                    Number(user.level) || 0;

                const oldBalance =
                    Number(user.balance) || 0;

                const oldCompleted =
                    Number(
                        user.completedTasks
                    ) || 0;

                // ======================================
                // ADD TASK REWARD
                // ======================================

                user.balance =
                    oldBalance +
                    TASK_REWARD;

                // ======================================
                // ADD XP
                // ======================================

                let newXP =
                    oldXP +
                    TASK_XP;

                let newLevel =
                    oldLevel;

                let levelBonus = 0;

                // ======================================
                // LEVEL UP
                // ======================================

                while (
                    newLevel < 100 &&
                    newXP >=
                    requiredXP(newLevel)
                ) {

                    newXP -=
                        requiredXP(newLevel);

                    newLevel++;

                    // Rs 1 per level up
                    user.balance +=
                        LEVEL_BONUS;

                    levelBonus++;
                }

                user.xp =
                    newXP;

                user.level =
                    newLevel;

                user.completedTasks =
                    oldCompleted + 1;
              // ==========================================
// REFERRAL REWARD — 3 APPROVED TASKS
// ==========================================

if (
    user.referredBy &&
    !user.referralRewardPaid &&
    user.completedTasks >= 3
) {

    const inviterIndex =
        users.findIndex(
            inviter =>
                String(inviter.id) ===
                String(user.referredBy)
        );

    if (inviterIndex !== -1) {

        const inviter =
            users[inviterIndex];

        const inviterBalance =
            Number(inviter.balance) || 0;

        inviter.balance =
            inviterBalance + 50;

        inviter.referralRewardPaid =
            true;

        inviter.referralReward =
            50;

        inviter.referralRewardFor =
            user.id;

        inviter.referralRewardAt =
            new Date()
            .toISOString();

        users[inviterIndex] =
            inviter;
    }

    user.referralRewardPaid =
        true;
}

                users[userIndex] =
                    user;

                if (
                    !writeJSON(
                        USERS_FILE,
                        users
                    )
                ) {

                    return res.status(500).json({

                        success: false,

                        message:
                            "Unable to update user."
                    });
                }

                task.reward =
                    TASK_REWARD;

                task.xp =
                    TASK_XP;

                task.levelBonus =
                    levelBonus;
            }

            task.status =
                status;

            task.updatedAt =
                new Date()
                .toISOString();

            tasks[taskIndex] =
                task;

            if (
                !writeJSON(
                    TASKS_FILE,
                    tasks
                )
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to update task."
                });
            }

            return res.json({

                success: true,

                message:
                    "Task status updated successfully.",

                status:
                    status,

                reward:
                    status === "approved"
                        ? TASK_REWARD
                        : 0,

                xp:
                    status === "approved"
                        ? TASK_XP
                        : 0,

                levelBonus:
                    status === "approved"
                        ? (
                            task.levelBonus || 0
                        )
                        : 0
            });

        } catch (error) {

            console.log(
                "Admin task status error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// ADMIN — GET WITHDRAWALS
// ======================================================

app.get(
    "/api/admin/withdrawals",
    (req, res) => {

        try {

            const withdrawals =
                readJSON(
                    WITHDRAW_FILE,
                    []
                );

            return res.json({

                success: true,

                withdrawals:
                    withdrawals
            });

        } catch (error) {

            console.log(
                "Admin withdrawals error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);
// ======================================================
// ADMIN — WITHDRAWAL STATUS
// ======================================================

app.post(
    "/api/admin/withdrawals/status",
    (req, res) => {

        try {

            const id =
                clean(req.body.id);

            const status =
                clean(req.body.status);

            if (!id || !status) {

                return res.status(400).json({

                    success: false,

                    message:
                        "ID and status required."
                });
            }

            if (
                !["approved", "rejected", "pending"]
                .includes(status)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid withdrawal status."
                });
            }

            const withdrawals =
                readJSON(
                    WITHDRAW_FILE,
                    []
                );

            const withdrawalIndex =
                withdrawals.findIndex(
                    item =>
                        String(item.id) ===
                        String(id)
                );

            if (withdrawalIndex === -1) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Withdrawal not found."
                });
            }

            const withdrawal =
                withdrawals[withdrawalIndex];

            // ==========================================
            // ONLY PROCESS WHEN STATUS CHANGES
            // ==========================================

            if (
                withdrawal.status !== status
            ) {

                const users =
                    readJSON(
                        USERS_FILE,
                        []
                    );

                const userIndex =
                    users.findIndex(
                        user =>
                            String(user.id) ===
                            String(withdrawal.userId)
                    );

                if (userIndex !== -1) {

                    const user =
                        users[userIndex];

                    const amount =
                        Number(
                            withdrawal.amount
                        ) || 0;

                    // ==================================
                    // REJECTED
                    // RETURN MONEY
                    // ==================================

                    if (
                        status === "rejected" &&
                        withdrawal.status !== "rejected"
                    ) {

                        user.balance =
                            (
                                Number(
                                    user.balance
                                ) || 0
                            ) + amount;
                    }

                    users[userIndex] =
                        user;

                    writeJSON(
                        USERS_FILE,
                        users
                    );
                }
            }

            withdrawal.status =
                status;

            withdrawal.updatedAt =
                new Date()
                .toISOString();

            withdrawals[withdrawalIndex] =
                withdrawal;

            writeJSON(
                WITHDRAW_FILE,
                withdrawals
            );

            return res.json({

                success: true,

                message:
                    "Withdrawal status updated.",

                withdrawal:
                    withdrawal
            });

        } catch (error) {

            console.log(
                "Withdrawal status error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// ADMIN — SEND SUPPORT MESSAGE
// ======================================================

app.post(
    "/api/admin/support",
    (req, res) => {

        try {

            const userId =
                clean(req.body.userId);

            const message =
                clean(req.body.message);

            if (!userId || !message) {

                return res.status(400).json({

                    success: false,

                    message:
                        "User ID and message are required."
                });
            }

            const messages =
                readJSON(
                    SUPPORT_FILE,
                    []
                );

            const newMessage = {

                id:
                    "ADMIN" +
                    Date.now(),

                userId:
                    userId,

                message:
                    message,

                sender:
                    "admin",

                createdAt:
                    new Date()
                    .toISOString()
            };

            messages.push(
                newMessage
            );

            writeJSON(
                SUPPORT_FILE,
                messages
            );

            return res.status(201).json({

                success: true,

                message:
                    "Admin message sent.",

                data:
                    newMessage
            });

        } catch (error) {

            console.log(
                "Admin support error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// ADMIN — GET ALL SUPPORT MESSAGES
// ======================================================

app.get(
    "/api/admin/support",
    (req, res) => {

        try {

            const messages =
                readJSON(
                    SUPPORT_FILE,
                    []
                );

            return res.json({

                success: true,

                messages:
                    messages
            });

        } catch (error) {

            console.log(
                "Admin support GET error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// ADMIN — UPDATE USER
// ======================================================

app.post(
    "/api/admin/users/update",
    (req, res) => {

        try {

            const userId =
                clean(req.body.userId);

            if (!userId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "User ID is required."
                });
            }

            const users =
                readJSON(
                    USERS_FILE,
                    []
                );

            const userIndex =
                users.findIndex(
                    user =>
                        String(user.id) ===
                        String(userId)
                );

            if (userIndex === -1) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found."
                });
            }

            const user =
                users[userIndex];

            // ==========================================
            // OPTIONAL VALUES
            // ==========================================

            if (
                req.body.balance !== undefined
            ) {

                const balance =
                    Number(
                        req.body.balance
                    );

                if (
                    !Number.isNaN(balance) &&
                    balance >= 0
                ) {

                    user.balance =
                        balance;
                }
            }

            if (
                req.body.xp !== undefined
            ) {

                const xp =
                    Number(
                        req.body.xp
                    );

                if (
                    !Number.isNaN(xp) &&
                    xp >= 0
                ) {

                    user.xp =
                        xp;
                }
            }

            if (
                req.body.level !== undefined
            ) {

                const level =
                    Number(
                        req.body.level
                    );

                if (
                    !Number.isNaN(level) &&
                    level >= 0
                ) {

                    user.level =
                        level;
                }
            }

            if (
                req.body.completedTasks !== undefined
            ) {

                const completed =
                    Number(
                        req.body.completedTasks
                    );

                if (
                    !Number.isNaN(completed) &&
                    completed >= 0
                ) {

                    user.completedTasks =
                        completed;
                }
            }

            if (
                req.body.status !== undefined
            ) {

                const newStatus =
                    clean(
                        req.body.status
                    );

                if (
                    [
                        "active",
                        "blocked",
                        "suspended"
                    ].includes(newStatus)
                ) {

                    user.status =
                        newStatus;
                }
            }

            users[userIndex] =
                user;

            writeJSON(
                USERS_FILE,
                users
            );

            return res.json({

                success: true,

                message:
                    "User updated successfully.",

                user:
                    safeUser(user)
            });

        } catch (error) {

            console.log(
                "Admin user update error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// ADMIN — DELETE USER
// ======================================================

app.post(
    "/api/admin/users/delete",
    (req, res) => {

        try {

            const userId =
                clean(req.body.userId);

            if (!userId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "User ID is required."
                });
            }

            const users =
                readJSON(
                    USERS_FILE,
                    []
                );

            const index =
                users.findIndex(
                    user =>
                        String(user.id) ===
                        String(userId)
                );

            if (index === -1) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found."
                });
            }

            users.splice(
                index,
                1
            );

            writeJSON(
                USERS_FILE,
                users
            );

            return res.json({

                success: true,

                message:
                    "User deleted successfully."
            });

        } catch (error) {

            console.log(
                "Delete user error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);
// ======================================================
// ADMIN — GET ALL USERS
// ======================================================

app.get(
    "/api/admin/users",
    (req, res) => {

        try {

            const users =
                readJSON(
                    USERS_FILE,
                    []
                );

            return res.json({

                success: true,

                users:
                    users.map(
                        user =>
                            safeUser(user)
                    )
            });

        } catch (error) {

            console.log(
                "Admin users error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// ADMIN — GET ALL TASKS
// ======================================================

app.get(
    "/api/admin/tasks",
    (req, res) => {

        try {

            const tasks =
                readJSON(
                    TASKS_FILE,
                    []
                );

            return res.json({

                success: true,

                tasks:
                    tasks
            });

        } catch (error) {

            console.log(
                "Admin tasks error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// ADMIN — GET ALL WITHDRAWALS
// ======================================================

app.get(
    "/api/admin/withdrawals",
    (req, res) => {

        try {

            const withdrawals =
                readJSON(
                    WITHDRAW_FILE,
                    []
                );

            return res.json({

                success: true,

                withdrawals:
                    withdrawals
            });

        } catch (error) {

            console.log(
                "Admin withdrawals error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// ADMIN — DASHBOARD STATS
// ======================================================

app.get(
    "/api/admin/stats",
    (req, res) => {

        try {

            const users =
                readJSON(
                    USERS_FILE,
                    []
                );

            const tasks =
                readJSON(
                    TASKS_FILE,
                    []
                );

            const withdrawals =
                readJSON(
                    WITHDRAW_FILE,
                    []
                );

            const totalBalance =
                users.reduce(
                    (sum, user) =>
                        sum +
                        (
                            Number(
                                user.balance
                            ) || 0
                        ),
                    0
                );

            const completedTasks =
                tasks.filter(
                    task =>
                        task.status ===
                        "approved"
                ).length;

            const pendingTasks =
                tasks.filter(
                    task =>
                        task.status ===
                        "pending"
                ).length;

            const pendingWithdrawals =
                withdrawals.filter(
                    item =>
                        item.status ===
                        "pending"
                ).length;

            return res.json({

                success: true,

                stats: {

                    totalUsers:
                        users.length,

                    completedTasks:
                        completedTasks,

                    pendingTasks:
                        pendingTasks,

                    totalBalance:
                        totalBalance,

                    pendingWithdrawals:
                        pendingWithdrawals
                }
            });

        } catch (error) {

            console.log(
                "Admin stats error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."
            });
        }
    }
);


// ======================================================
// 404 API HANDLER
// ======================================================

// ======================================================
// ADMIN LOGIN
// ======================================================

app.post(
    "/api/admin/login",
    (req, res) => {

        try {

            const username =
                String(req.body.username || "").trim();

            const password =
                String(req.body.password || "");

            // Change these to your own admin credentials
            const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
            const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

            if (
                username === ADMIN_USERNAME &&
                password === ADMIN_PASSWORD
            ) {

                return res.json({
                    success: true,
                    message: "Admin login successful."
                });

            }

            return res.status(401).json({
                success: false,
                message: "Invalid admin username or password."
            });

        } catch (error) {

            console.log(
                "Admin login error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Server error."
            });

        }

    }
);


app.use(
    "/api",
    (req, res) => {

        return res.status(404).json({

            success: false,

            message:
                "API endpoint not found."
        });
    }
);


// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

app.use(
    (error, req, res, next) => {

        console.log(
            "Global server error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Internal server error."
        });
    }
);


// ======================================================
// START SERVER
// ======================================================
// ======================================================
// TEAM & REFERRAL API
// ======================================================

app.get("/api/team/:userId", (req, res) => {

    try {

        const userId =
            clean(req.params.userId);

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required."
            });
        }

        const users =
            readJSON(
                USERS_FILE,
                []
            );

        const tasks =
            readJSON(
                TASKS_FILE,
                []
            );

        const user =
            users.find(
                item =>
                    String(item.id) ===
                    String(userId)
            );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        // ------------------------------------------
        // REFERRAL LINK
        // ------------------------------------------

        const referralLink =
            "https://ft-trade-frontend.pages.dev/signup.html?ref=" +
            encodeURIComponent(user.id);

        // ------------------------------------------
        // FIND REFERRED MEMBERS
        // ------------------------------------------

        const members =
            users
                .filter(
                    member =>
                        String(member.referredBy || "") ===
                        String(user.id)
                )
                .map(member => {

                    const approvedTasks =
                        tasks.filter(
                            task =>
                                String(task.userId) ===
                                String(member.id) &&
                                String(task.status).toLowerCase() ===
                                "approved"
                        ).length;

                    const completed =
                        Math.min(
                            approvedTasks,
                            3
                        );

                    return {

                        id:
                            member.id,

                        name:
                            member.name,

                        email:
                            member.email,

                        completed:
                            completed,

                        required:
                            3,

                        progress:
                            completed + " / 3",

                        reward:
                            50,

                        rewardPaid:
                            Boolean(
                                member.referralRewardPaid
                            ),

                        joinedAt:
                            member.createdAt || null
                    };

                });

        // ------------------------------------------
        // TOTAL REWARDS
        // ------------------------------------------

        const rewardsEarned =
            members.filter(
                member =>
                    member.rewardPaid === true
            ).length * 50;

        return res.json({

            success: true,

            referralLink:

                referralLink,

            totalMembers:

                members.length,

            rewardsEarned:

                rewardsEarned,

            members:

                members

        });

    } catch (error) {

        console.log(
            "Team API error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Server error."

        });

    }

});
app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");
        console.log(
            "================================="
        );
        console.log(
            "          FT TRADE SERVER"
        );
        console.log(
            "================================="
        );
        console.log(
            "Server running on port " +
            PORT
        );
        console.log(
            "Local: http://127.0.0.1:" +
            PORT
        );
        console.log(
            "Network: http://0.0.0.0:" +
            PORT
        );
        console.log(
            "================================="
        );
        console.log("");
    }
);
