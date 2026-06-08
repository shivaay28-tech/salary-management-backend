"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAuditLogs = listAuditLogs;
const AuditLog_1 = require("../models/AuditLog");
const enums_1 = require("../types/enums");
const errorHandler_1 = require("../middleware/errorHandler");
async function listAuditLogs(req, res) {
    if (req.user?.role !== enums_1.UserRole.SUPER_ADMIN) {
        throw new errorHandler_1.AppError("Forbidden", 403);
    }
    const filter = {};
    if (req.query.module)
        filter.module = String(req.query.module);
    const logs = await AuditLog_1.AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(Number(req.query.limit ?? 100));
    res.json({ success: true, data: logs });
}
