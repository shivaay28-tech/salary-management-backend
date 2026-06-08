"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRoles = requireRoles;
exports.canAccessOffice = canAccessOffice;
exports.assertOfficeAccess = assertOfficeAccess;
const enums_1 = require("../types/enums");
const errorHandler_1 = require("./errorHandler");
function requireRoles(...roles) {
    return (req, _res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            throw new errorHandler_1.AppError("Forbidden", 403);
        }
        next();
    };
}
function canAccessOffice(officeId, req) {
    if (!req.user)
        return false;
    if (req.user.role === enums_1.UserRole.SUPER_ADMIN)
        return true;
    return req.user.assignedOfficeIds.includes(officeId);
}
function assertOfficeAccess(req, officeId) {
    if (!canAccessOffice(officeId, req)) {
        throw new errorHandler_1.AppError("You do not have access to this office", 403);
    }
}
