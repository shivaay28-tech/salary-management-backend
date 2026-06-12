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
const exportController = __importStar(require("../controllers/exportController"));
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const permissions_1 = require("../types/permissions");
const asyncHandler_1 = require("../utils/asyncHandler");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get("/salary", (0, rbac_1.requirePermission)(permissions_1.Permission.SALARIES, permissions_1.Permission.REPORTS), (0, asyncHandler_1.asyncHandler)(exportController.exportSalaryReport));
router.get("/employees", (0, rbac_1.requirePermission)(permissions_1.Permission.EMPLOYEES, permissions_1.Permission.REPORTS), (0, asyncHandler_1.asyncHandler)(exportController.exportEmployeeList));
router.get("/advances", (0, rbac_1.requirePermission)(permissions_1.Permission.ADVANCES, permissions_1.Permission.REPORTS), (0, asyncHandler_1.asyncHandler)(exportController.exportAdvanceReport));
router.get("/advance-statement", (0, rbac_1.requirePermission)(permissions_1.Permission.ADVANCES, permissions_1.Permission.REPORTS), (0, asyncHandler_1.asyncHandler)(exportController.exportAdvanceStatement));
router.get("/deferred-statement", (0, rbac_1.requirePermission)(permissions_1.Permission.SALARIES, permissions_1.Permission.REPORTS), (0, asyncHandler_1.asyncHandler)(exportController.exportDeferredStatement));
router.get("/skipped-statement", (0, rbac_1.requirePermission)(permissions_1.Permission.SALARIES, permissions_1.Permission.REPORTS), (0, asyncHandler_1.asyncHandler)(exportController.exportSkippedStatement));
exports.default = router;
