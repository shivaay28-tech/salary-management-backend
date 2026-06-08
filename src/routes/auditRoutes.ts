import { Router } from "express";
import * as auditController from "../controllers/auditController";
import { authenticate } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { Permission } from "../types/permissions";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate, requirePermission(Permission.AUDIT_LOGS));
router.get("/", asyncHandler(auditController.listAuditLogs));

export default router;
