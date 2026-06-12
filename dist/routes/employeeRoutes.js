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
const employeeController = __importStar(require("../controllers/employeeController"));
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const permissions_1 = require("../types/permissions");
const asyncHandler_1 = require("../utils/asyncHandler");
const uploadService_1 = require("../services/uploadService");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate, (0, rbac_1.requirePermission)(permissions_1.Permission.EMPLOYEES));
router.get("/", (0, asyncHandler_1.asyncHandler)(employeeController.listEmployees));
router.get("/import/template", (0, asyncHandler_1.asyncHandler)(employeeController.downloadImportTemplate));
router.post("/import", uploadService_1.excelUpload.single("file"), (0, asyncHandler_1.asyncHandler)(employeeController.importEmployees));
router.get("/:id", (0, asyncHandler_1.asyncHandler)(employeeController.getEmployee));
router.post("/", (0, asyncHandler_1.asyncHandler)(employeeController.createEmployee));
router.put("/:id", (0, asyncHandler_1.asyncHandler)(employeeController.updateEmployee));
router.delete("/:id", (0, asyncHandler_1.asyncHandler)(employeeController.deleteEmployee));
router.post("/:id/photo", uploadService_1.photoUpload.single("photo"), (0, asyncHandler_1.asyncHandler)(employeeController.uploadPhoto));
exports.default = router;
