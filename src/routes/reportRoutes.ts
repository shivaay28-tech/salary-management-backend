import { Router } from "express";
import * as reportController from "../controllers/reportController";
import { authenticate } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { Permission } from "../types/permissions";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate, requirePermission(Permission.REPORTS));

router.get("/monthly-salary", asyncHandler(reportController.monthlySalaryReport));
router.get("/employees", asyncHandler(reportController.employeePeriodReport));
router.get(
  "/employee-history",
  asyncHandler(reportController.employeeSalaryHistory)
);
router.get("/advances", asyncHandler(reportController.advanceReport));

export default router;
