"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const officeController = __importStar(require("../controllers/officeController"));
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const enums_1 = require("../types/enums");
const permissions_1 = require("../types/permissions");
const asyncHandler_1 = require("../utils/asyncHandler");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get("/", (0, asyncHandler_1.asyncHandler)(officeController.listOffices));
router.get("/:id", (0, asyncHandler_1.asyncHandler)(officeController.getOffice));
router.post("/", (0, rbac_1.requireRoles)(enums_1.UserRole.SUPER_ADMIN), (0, asyncHandler_1.asyncHandler)(officeController.createOffice));
router.put("/:id", (0, rbac_1.requirePermission)(permissions_1.Permission.OFFICES), (0, asyncHandler_1.asyncHandler)(officeController.updateOffice));
router.delete("/:id", (0, rbac_1.requireRoles)(enums_1.UserRole.SUPER_ADMIN), (0, asyncHandler_1.asyncHandler)(officeController.deleteOffice));
exports.default = router;
