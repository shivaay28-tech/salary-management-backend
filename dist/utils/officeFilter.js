"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOfficeIdFilter = getOfficeIdFilter;
exports.getOfficeIdsForQuery = getOfficeIdsForQuery;
const mongoose_1 = __importDefault(require("mongoose"));
const enums_1 = require("../types/enums");
function getOfficeIdFilter(req) {
    if (!req.user || req.user.role === enums_1.UserRole.SUPER_ADMIN) {
        return {};
    }
    const officeIds = (req.user.assignedOfficeIds ?? []).filter(Boolean);
    if (officeIds.length === 0) {
        return { officeId: { $in: [] } };
    }
    return {
        officeId: {
            $in: officeIds.map((id) => new mongoose_1.default.Types.ObjectId(id)),
        },
    };
}
function getOfficeIdsForQuery(req) {
    if (!req.user || req.user.role === enums_1.UserRole.SUPER_ADMIN)
        return null;
    return (req.user.assignedOfficeIds ?? []).filter(Boolean);
}
