
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const dotenv = require("dotenv");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_NAME = process.env.DB_NAME || "QueueLess";
const TOTAL_COUNTERS = 3;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const JWT_SECRET = process.env.JWT_SECRET;

const COOKIE_NAME = "queueless_admin";
const TOKEN_EXPIRY = "8h";
const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000;

if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is missing from .env");
    process.exit(1);
}

if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH || !JWT_SECRET) {
    console.error(
        "ADMIN_USERNAME, ADMIN_PASSWORD_HASH and JWT_SECRET are required in .env"
    );
    process.exit(1);
}

if (JWT_SECRET.length < 32) {
    console.error("JWT_SECRET must be at least 32 characters long.");
    process.exit(1);
}

const allowedOrigins = [
"http://localhost:5500",
"http://127.0.0.1:5500"
];

const configuredOrigin = process.env.FRONTEND_ORIGIN;

if (configuredOrigin && !allowedOrigins.includes(configuredOrigin)) {
allowedOrigins.push(configuredOrigin);
}

app.use(cors({
origin: function (origin, callback) {
// Allow requests without an Origin header, such as local health checks.
if (!origin || allowedOrigins.includes(origin)) {
return callback(null, true);
}


    return callback(new Error(`CORS blocked origin: ${origin}`));
},
credentials: true


}));

app.use(express.json({ limit: "10kb" }));

const client = new MongoClient(process.env.MONGODB_URI);

let queueCollection;
let countersCollection;

// ==========================================
// AUTHENTICATION HELPERS
// ==========================================

function isValidObjectId(id) {
    return ObjectId.isValid(id) &&
        String(new ObjectId(id)) === String(id);
}

function createAdminToken() {
    return jwt.sign(
        {
            role: "admin",
            username: ADMIN_USERNAME
        },
        JWT_SECRET,
        {
            expiresIn: TOKEN_EXPIRY,
            issuer: "QueueLess",
            audience: "QueueLess-Admin"
        }
    );
}

function getCookie(req, name) {
    const cookieHeader = req.headers.cookie || "";

    for (const cookie of cookieHeader.split(";")) {
        const separator = cookie.indexOf("=");

        if (separator === -1) continue;

        const key = cookie.slice(0, separator).trim();

        if (key === name) {
            return decodeURIComponent(
                cookie.slice(separator + 1).trim()
            );
        }
    }

    return null;
}

function setAdminCookie(res, token) {
    const secure = process.env.COOKIE_SECURE === "true";

    res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=${secure ? "None" : "Lax"}; Max-Age=${Math.floor(COOKIE_MAX_AGE / 1000)}${secure ? "; Secure" : ""}`
    );
}

function clearAdminCookie(res) {
    const secure = process.env.COOKIE_SECURE === "true";

    res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=${secure ? "None" : "Lax"}; Max-Age=0${secure ? "; Secure" : ""}`
    );
}

function requireAdmin(req, res, next) {
    const token = getCookie(req, COOKIE_NAME);

    if (!token) {
        return res.status(401).json({
            success: false,
            error: "Admin login required."
        });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET, {
            issuer: "QueueLess",
            audience: "QueueLess-Admin"
        });

        if (
            payload.role !== "admin" ||
            payload.username !== ADMIN_USERNAME
        ) {
            return res.status(403).json({
                success: false,
                error: "Admin access denied."
            });
        }

        req.admin = payload;
        next();
    } catch (_) {
        clearAdminCookie(res);

        return res.status(401).json({
            success: false,
            error: "Session expired. Please log in again."
        });
    }
}

function getLocalDayRange(dateString) {
    let date;

    if (dateString !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            return null;
        }

        const [year, month, day] = dateString.split("-").map(Number);

        date = new Date(year, month - 1, day);

        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day
        ) {
            return null;
        }
    } else {
        const now = new Date();

        date = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );
    }

    const end = new Date(date);
    end.setDate(end.getDate() + 1);

    return { start: date, end };
}

// ==========================================
// START SERVER AND CONNECT TO MONGODB
// ==========================================

async function startServer() {
    try {
        await client.connect();

        const database = client.db(DB_NAME);

        queueCollection = database.collection("customers");
        countersCollection = database.collection("counters");

        await queueCollection.createIndex(
            { token: 1 },
            { unique: true }
        );

        for (let number = 1; number <= TOTAL_COUNTERS; number++) {
            await countersCollection.updateOne(
                { _id: `serviceCounter${number}` },
                {
                    $setOnInsert: {
                        name: `Counter ${number}`,
                        active: true,
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );
        }

        console.log("Connected to MongoDB Atlas!");

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`QueueLess backend running on port ${PORT}`);
            console.log(`Configured counters: ${TOTAL_COUNTERS}`);
            console.log("Admin authentication enabled.");
            console.log("Analytics endpoint: GET /api/analytics");
        });
    } catch (error) {
        console.error("Could not start QueueLess:", error.message);

        try {
            await client.close();
        } catch (_) {}

        process.exit(1);
    }
}

// ==========================================
// HEALTH CHECK
// GET /api/health
// ==========================================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "QueueLess API is running!"
    });
});

// ==========================================
// ADMIN LOGIN
// POST /api/admin/login
// ==========================================

app.post("/api/admin/login", async (req, res) => {
    try {
        const username = String(req.body?.username || "");
        const password = String(req.body?.password || "");

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: "Username and password are required."
            });
        }

        const usernameMatches = username === ADMIN_USERNAME;

        // Always perform a password hash comparison to avoid
        // making username checks the only significant work.
        const passwordMatches = await bcrypt.compare(
            password,
            ADMIN_PASSWORD_HASH
        );

        if (!usernameMatches || !passwordMatches) {
            return res.status(401).json({
                success: false,
                error: "Invalid username or password."
            });
        }

        const token = createAdminToken();

        setAdminCookie(res, token);

        res.json({
            success: true,
            message: "Admin login successful.",
            username: ADMIN_USERNAME
        });
    } catch (error) {
        console.error("Admin login error:", error.message);

        res.status(500).json({
            success: false,
            error: "Could not complete login."
        });
    }
});

// ==========================================
// CHECK ADMIN SESSION
// GET /api/admin/session
// ==========================================

app.get("/api/admin/session", requireAdmin, (req, res) => {
    res.json({
        success: true,
        authenticated: true,
        username: req.admin.username
    });
});

// ==========================================
// ADMIN LOGOUT
// POST /api/admin/logout
// ==========================================

app.post("/api/admin/logout", (req, res) => {
    clearAdminCookie(res);

    res.json({
        success: true,
        message: "Logged out successfully."
    });
});

// ==========================================
// GENERATE TOKEN NUMBER
// ==========================================

async function databaseCounter() {
    const result = await countersCollection.findOneAndUpdate(
        { _id: "queueToken" },
        { $inc: { sequence: 1 } },
        {
            upsert: true,
            returnDocument: "after"
        }
    );

    const document = result?.value ?? result;

    if (!document || !Number.isInteger(document.sequence)) {
        throw new Error("Could not generate the next token number.");
    }

    return document.sequence;
}

// ==========================================
// CREATE CUSTOMER TOKEN — PUBLIC
// POST /api/queue
// ==========================================

app.post("/api/queue", async (req, res) => {
    try {
        const name = String(req.body?.name || "").trim();
        const service = String(req.body?.service || "").trim();

        if (!name || !service) {
            return res.status(400).json({
                success: false,
                error: "Customer name and service are required."
            });
        }

        if (name.length > 100 || service.length > 100) {
            return res.status(400).json({
                success: false,
                error: "Name and service must be 100 characters or fewer."
            });
        }

        const sequence = await databaseCounter();

        const customer = {
            token: `A-${String(sequence).padStart(3, "0")}`,
            name,
            service,
            status: "Waiting",
            counterNumber: null,
            assignedCounterNumber: null,
            createdAt: new Date()
        };

        const result = await queueCollection.insertOne(customer);
        customer._id = result.insertedId;

        res.status(201).json({
            success: true,
            message: "Token generated successfully!",
            customer
        });
    } catch (error) {
        console.error("Token creation error:", error.message);

        res.status(500).json({
            success: false,
            error: "Could not create token. Please try again."
        });
    }
});

// ==========================================
// GET ALL CUSTOMERS — ADMIN ONLY
// GET /api/queue
// ==========================================

app.get("/api/queue", requireAdmin, async (req, res) => {
    try {
        const customers = await queueCollection
            .find({})
            .sort({ createdAt: 1 })
            .toArray();

        res.json(customers);
    } catch (error) {
        console.error("Queue fetch error:", error.message);

        res.status(500).json({
            success: false,
            error: "Could not fetch the queue."
        });
    }
});

// ==========================================
// GET ONE CUSTOMER — PUBLIC TRACKING
// GET /api/queue/:id
// ==========================================

app.get("/api/queue/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: "Invalid token ID."
            });
        }

        const customer = await queueCollection.findOne(
            { _id: new ObjectId(id) },
            {
                projection: {
                    token: 1,
                    service: 1,
                    status: 1,
                    counterNumber: 1,
                    createdAt: 1,
                    calledAt: 1
                }
            }
        );

        if (!customer) {
            return res.status(404).json({
                success: false,
                error: "Token not found."
            });
        }

        res.json({ success: true, customer });
    } catch (error) {
        console.error("Token lookup error:", error.message);

        res.status(500).json({
            success: false,
            error: "Could not retrieve token."
        });
    }
});

// ==========================================
// GET COUNTERS — PUBLIC LIVE DISPLAY
// GET /api/counters
// ==========================================

app.get("/api/counters", async (req, res) => {
    try {
        const counters = await countersCollection
            .find({
                _id: { $regex: "^serviceCounter[0-9]+$" }
            })
            .sort({ _id: 1 })
            .toArray();

        const results = await Promise.all(
            counters.map(async (counter) => {
                const counterNumber = Number(
                    counter._id.replace("serviceCounter", "")
                );

                const servingCustomer = await queueCollection.findOne(
                    { status: "Serving", counterNumber },
                    {
                        projection: {
                            token: 1,
                            status: 1,
                            counterNumber: 1,
                            service: 1
                        }
                    }
                );

                return {
                    counterNumber,
                    name: counter.name,
                    active: counter.active,
                    customer: servingCustomer || null
                };
            })
        );

        res.json({
            success: true,
            counters: results
        });
    } catch (error) {
        console.error("Counter fetch error:", error.message);

        res.status(500).json({
            success: false,
            error: "Could not fetch service counters."
        });
    }
});

// ==========================================
// CALL NEXT CUSTOMER — ADMIN ONLY
// POST /api/counters/:counterNumber/next
// ==========================================

app.post(
    "/api/counters/:counterNumber/next",
    requireAdmin,
    async (req, res) => {
        try {
            const counterNumber = Number(req.params.counterNumber);

            if (
                !Number.isInteger(counterNumber) ||
                counterNumber < 1 ||
                counterNumber > TOTAL_COUNTERS
            ) {
                return res.status(400).json({
                    success: false,
                    error: `Counter number must be between 1 and ${TOTAL_COUNTERS}.`
                });
            }

            const counter = await countersCollection.findOne({
                _id: `serviceCounter${counterNumber}`,
                active: true
            });

            if (!counter) {
                return res.status(404).json({
                    success: false,
                    error: "Counter not found or inactive."
                });
            }

            const alreadyServing = await queueCollection.findOne({
                status: "Serving",
                counterNumber
            });

            if (alreadyServing) {
                return res.status(409).json({
                    success: false,
                    error: `${counter.name} is already serving ${alreadyServing.token}. Complete or skip that customer first.`
                });
            }

            const result = await queueCollection.findOneAndUpdate(
                { status: "Waiting" },
                {
                    $set: {
                        status: "Serving",
                        counterNumber,
                        assignedCounterNumber: counterNumber,
                        calledAt: new Date()
                    }
                },
                {
                    sort: { createdAt: 1 },
                    returnDocument: "after"
                }
            );

            const customer = result?.value ?? result;

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    error: "There are no waiting customers."
                });
            }

            res.json({
                success: true,
                message: `${customer.token} called to ${counter.name}.`,
                customer
            });
        } catch (error) {
            console.error("Call next error:", error.message);

            res.status(500).json({
                success: false,
                error: "Could not call the next customer."
            });
        }
    }
);

// ==========================================
// UPDATE CUSTOMER STATUS — ADMIN ONLY
// PATCH /api/queue/:id/status
// ==========================================

app.patch("/api/queue/:id/status", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, counterNumber } = req.body || {};

        const allowedStatuses = [
            "Waiting",
            "Serving",
            "Completed",
            "Skipped"
        ];

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: "Invalid customer ID."
            });
        }

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: "Invalid status."
            });
        }

        const customerId = new ObjectId(id);

        const existingCustomer = await queueCollection.findOne({
            _id: customerId
        });

        if (!existingCustomer) {
            return res.status(404).json({
                success: false,
                error: "Customer not found."
            });
        }

        const update = { status };

        if (status === "Serving") {
            const chosenCounter = Number(counterNumber);

            if (
                !Number.isInteger(chosenCounter) ||
                chosenCounter < 1 ||
                chosenCounter > TOTAL_COUNTERS
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Choose a valid counter number from 1 to 3."
                });
            }

            const counter = await countersCollection.findOne({
                _id: `serviceCounter${chosenCounter}`,
                active: true
            });

            if (!counter) {
                return res.status(400).json({
                    success: false,
                    error: "The selected counter is inactive or unavailable."
                });
            }

            const alreadyServing = await queueCollection.findOne({
                status: "Serving",
                counterNumber: chosenCounter,
                _id: { $ne: customerId }
            });

            if (alreadyServing) {
                return res.status(409).json({
                    success: false,
                    error: `Counter ${chosenCounter} is already serving another customer.`
                });
            }

            update.counterNumber = chosenCounter;
            update.assignedCounterNumber = chosenCounter;

            if (existingCustomer.status !== "Serving") {
                update.calledAt = new Date();
            }
        } else {
            update.counterNumber = null;
        }

        const result = await queueCollection.updateOne(
            { _id: customerId },
            { $set: update }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                error: "Customer not found."
            });
        }

        res.json({
            success: true,
            message: "Customer status updated successfully."
        });
    } catch (error) {
        console.error("Status update error:", error.message);

        res.status(500).json({
            success: false,
            error: "Could not update customer status."
        });
    }
});

// ==========================================
// DELETE CUSTOMER — ADMIN ONLY
// DELETE /api/queue/:id
// ==========================================

app.delete("/api/queue/:id", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: "Invalid customer ID."
            });
        }

        const result = await queueCollection.deleteOne({
            _id: new ObjectId(id)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                error: "Customer not found."
            });
        }

        res.json({
            success: true,
            message: "Customer removed successfully."
        });
    } catch (error) {
        console.error("Delete error:", error.message);

        res.status(500).json({
            success: false,
            error: "Could not remove customer."
        });
    }
});

// ==========================================
// ANALYTICS — ADMIN ONLY
// GET /api/analytics?date=YYYY-MM-DD
// ==========================================

app.get("/api/analytics", requireAdmin, async (req, res) => {
    try {
        const range = getLocalDayRange(req.query.date);

        if (!range) {
            return res.status(400).json({
                success: false,
                error: "Please provide a valid date using YYYY-MM-DD."
            });
        }

        const { start, end } = range;

        const customers = await queueCollection.find({
            createdAt: {
                $gte: start,
                $lt: end
            }
        }).toArray();

        const summary = {
            totalCustomers: customers.length,
            waiting: 0,
            serving: 0,
            completed: 0,
            skipped: 0,
            averageWaitingMinutes: null,
            customersWithWaitingTime: 0,
            busiestHour: null
        };

        const counterPerformance = Array.from(
            { length: TOTAL_COUNTERS },
            (_, index) => ({
                counterNumber: index + 1,
                counterName: `Counter ${index + 1}`,
                completedCustomers: 0,
                currentlyServing: 0,
                totalCalled: 0
            })
        );

        const hourlyCustomers = Array.from(
            { length: 24 },
            (_, hour) => ({
                hour,
                label: `${String(hour).padStart(2, "0")}:00`,
                customers: 0
            })
        );

        let totalWaitingMilliseconds = 0;

        for (const customer of customers) {
            if (customer.status === "Waiting") summary.waiting++;
            if (customer.status === "Serving") summary.serving++;
            if (customer.status === "Completed") summary.completed++;
            if (customer.status === "Skipped") summary.skipped++;

            const createdAt = customer.createdAt
                ? new Date(customer.createdAt)
                : null;

            const calledAt = customer.calledAt
                ? new Date(customer.calledAt)
                : null;

            if (createdAt && !Number.isNaN(createdAt.getTime())) {
                hourlyCustomers[createdAt.getHours()].customers++;
            }

            if (
                createdAt &&
                calledAt &&
                !Number.isNaN(createdAt.getTime()) &&
                !Number.isNaN(calledAt.getTime()) &&
                calledAt >= createdAt
            ) {
                totalWaitingMilliseconds +=
                    calledAt.getTime() - createdAt.getTime();

                summary.customersWithWaitingTime++;
            }

            const assignedCounter =
                customer.assignedCounterNumber ??
                customer.counterNumber;

            if (
                Number.isInteger(assignedCounter) &&
                assignedCounter >= 1 &&
                assignedCounter <= TOTAL_COUNTERS
            ) {
                const counter = counterPerformance[assignedCounter - 1];

                if (customer.calledAt) counter.totalCalled++;
                if (customer.status === "Completed") {
                    counter.completedCustomers++;
                }
                if (customer.status === "Serving") {
                    counter.currentlyServing++;
                }
            }
        }

        if (summary.customersWithWaitingTime > 0) {
            summary.averageWaitingMinutes = Number(
                (
                    totalWaitingMilliseconds /
                    summary.customersWithWaitingTime /
                    60000
                ).toFixed(2)
            );
        }

        const busiestHour = hourlyCustomers.reduce(
            (best, current) =>
                current.customers > best.customers ? current : best,
            hourlyCustomers[0]
        );

        if (busiestHour.customers > 0) {
            summary.busiestHour = busiestHour;
        }

        res.json({
            success: true,
            date: [
                start.getFullYear(),
                String(start.getMonth() + 1).padStart(2, "0"),
                String(start.getDate()).padStart(2, "0")
            ].join("-"),
            summary,
            counterPerformance,
            hourlyCustomers
        });
    } catch (error) {
        console.error("Analytics error:", error.message);

        res.status(500).json({
            success: false,
            error: "Could not load analytics."
        });
    }
});

// ==========================================
// UNKNOWN API ROUTES
// ==========================================

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        error: "API endpoint not found."
    });
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use((error, req, res, next) => {
    console.error("Unexpected server error:", error.message);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        error: "An unexpected server error occurred."
    });
});

// ==========================================
// START AND SHUT DOWN
// ==========================================

startServer();

async function shutdown() {
    console.log("\nClosing QueueLess server...");

    try {
        await client.close();
        console.log("MongoDB connection closed.");
        process.exit(0);
    } catch (error) {
        console.error("Error closing MongoDB:", error.message);
        process.exit(1);
    }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

