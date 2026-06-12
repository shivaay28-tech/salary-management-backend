"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRoles = requireRoles;
exports.canAccessOffice = canAccessOffice;
exports.assertOfficeAccess = assertOfficeAccess;
exports.hasPermission = hasPermission;
exports.requirePermission = requirePermission;
const enums_1 = require("../types/enums");
const permissions_1 = require("../types/permissions");
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
function hasPermission(req, permission) {
    if (!req.user)
        return false;
    if (req.user.role === enums_1.UserRole.SUPER_ADMIN)
        return true;
    return (0, permissions_1.resolvePermissions)(req.user.permissions).includes(permission);
}
function requirePermission(...permissions) {
    return (req, _res, next) => {
        if (!req.user) {
            throw new errorHandler_1.AppError("Unauthorized", 401);
        }
        if (req.user.role === enums_1.UserRole.SUPER_ADMIN) {
            next();
            return;
        }
        const userPerms = (0, permissions_1.resolvePermissions)(req.user.permissions ?? permissions_1.ALL_PERMISSIONS);
        if (!permissions.some((p) => userPerms.includes(p))) {
            throw new errorHandler_1.AppError("Forbidden", 403);
        }
        next();
    };
}
