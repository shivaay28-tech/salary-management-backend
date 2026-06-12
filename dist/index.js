"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const db_1 = require("./config/db");
const env_1 = require("./config/env");
const errorHandler_1 = require("./middleware/errorHandler");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const officeRoutes_1 = __importDefault(require("./routes/officeRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const employeeRoutes_1 = __importDefault(require("./routes/employeeRoutes"));
const advanceRoutes_1 = __importDefault(require("./routes/advanceRoutes"));
const salaryRoutes_1 = __importDefault(require("./routes/salaryRoutes"));
const dashboardRoutes_1 = __importDefault(require("./routes/dashboardRoutes"));
const reportRoutes_1 = __importDefault(require("./routes/reportRoutes"));
const auditRoutes_1 = __importDefault(require("./routes/auditRoutes"));
const exportRoutes_1 = __importDefault(require("./routes/exportRoutes"));
const app = (0, express_1.default)();
// Required when deployed behind nginx / cloud load balancers (X-Forwarded-For).
const trustProxy = process.env.TRUST_PROXY === "true" ||
    (process.env.NODE_ENV === "production" && process.env.TRUST_PROXY !== "false");
if (trustProxy) {
    app.set("trust proxy", 1);
}
app.use((0, cors_1.default)({
    origin: env_1.env.clientUrl,
    credentials: true,
}));
app.use(express_1.default.json({ limit: "10mb" }));
app.use((0, cookie_parser_1.default)());
app.use((0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
}));
app.get("/api/health", (_req, res) => {
    res.json({ success: true, message: "Salary Management API is running" });
});
app.use("/uploads", express_1.default.static(path_1.default.join(process.cwd(), "uploads")));
app.use("/api/auth", authRoutes_1.default);
app.use("/api/offices", officeRoutes_1.default);
app.use("/api/users", userRoutes_1.default);
app.use("/api/employees", employeeRoutes_1.default);
app.use("/api/advances", advanceRoutes_1.default);
app.use("/api/salaries", salaryRoutes_1.default);
app.use("/api/dashboard", dashboardRoutes_1.default);
app.use("/api/reports", reportRoutes_1.default);
app.use("/api/audit-logs", auditRoutes_1.default);
app.use("/api/export", exportRoutes_1.default);
app.use(errorHandler_1.errorHandler);
async function start() {
    await (0, db_1.connectDB)();
    app.listen(env_1.env.port, () => {
        console.log(`Server running on port ${env_1.env.port}`);
    });
}
start().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
