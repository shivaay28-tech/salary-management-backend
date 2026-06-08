"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOfficeIdFilter = getOfficeIdFilter;
exports.getOfficeIdsForQuery = getOfficeIdsForQuery;
const enums_1 = require("../types/enums");
function getOfficeIdFilter(req) {
    if (!req.user || req.user.role === enums_1.UserRole.SUPER_ADMIN) {
        return {};
    }
    return { officeId: { $in: req.user.assignedOfficeIds } };
}
function getOfficeIdsForQuery(req) {
    if (!req.user || req.user.role === enums_1.UserRole.SUPER_ADMIN)
        return null;
    return req.user.assignedOfficeIds;
}
