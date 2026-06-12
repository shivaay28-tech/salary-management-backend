"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAuditLogs = listAuditLogs;
const AuditLog_1 = require("../models/AuditLog");
async function listAuditLogs(req, res) {
    const filter = {};
    if (req.query.module)
        filter.module = String(req.query.module);
    const logs = await AuditLog_1.AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(Number(req.query.limit ?? 100));
    res.json({ success: true, data: logs });
}
