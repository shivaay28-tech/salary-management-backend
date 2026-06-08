"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = logAudit;
const AuditLog_1 = require("../models/AuditLog");
async function logAudit(user, action, module, details) {
    await AuditLog_1.AuditLog.create({
        userId: user.userId,
        userEmail: user.email,
        action,
        module,
        details,
    });
}
