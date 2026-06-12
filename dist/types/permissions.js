"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSION_LABELS = exports.ALL_PERMISSIONS = exports.Permission = void 0;
exports.resolvePermissions = resolvePermissions;
var Permission;
(function (Permission) {
    Permission["DASHBOARD"] = "dashboard";
    Permission["OFFICES"] = "offices";
    Permission["EMPLOYEES"] = "employees";
    Permission["SALARIES"] = "salaries";
    Permission["ADVANCES"] = "advances";
    Permission["REPORTS"] = "reports";
    Permission["USERS"] = "users";
    Permission["AUDIT_LOGS"] = "audit_logs";
})(Permission || (exports.Permission = Permission = {}));
exports.ALL_PERMISSIONS = Object.values(Permission);
exports.PERMISSION_LABELS = {
    [Permission.DASHBOARD]: "Dashboard",
    [Permission.OFFICES]: "Offices",
    [Permission.EMPLOYEES]: "Employees",
    [Permission.SALARIES]: "Salaries",
    [Permission.ADVANCES]: "Advances",
    [Permission.REPORTS]: "Reports & Export",
    [Permission.USERS]: "Sub Admins",
    [Permission.AUDIT_LOGS]: "Audit Logs",
};
function resolvePermissions(permissions) {
    if (permissions && permissions.length > 0)
        return permissions;
    return exports.ALL_PERMISSIONS;
}
