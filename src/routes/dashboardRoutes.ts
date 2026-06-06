import { Router } from "express";
import * as dashboardController from "../controllers/dashboardController";
import { authenticate } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { Permission } from "../types/permissions";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate, requirePermission(Permission.DASHBOARD));
router.get("/", asyncHandler(dashboardController.getDashboard));

export default router;
