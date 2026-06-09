import { Router } from "express";
import * as exportController from "../controllers/exportController";
import { authenticate } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { Permission } from "../types/permissions";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate);

router.get(
  "/salary",
  requirePermission(Permission.SALARIES, Permission.REPORTS),
  asyncHandler(exportController.exportSalaryReport)
);
router.get(
  "/employees",
  requirePermission(Permission.EMPLOYEES, Permission.REPORTS),
  asyncHandler(exportController.exportEmployeeList)
);
router.get(
  "/advances",
  requirePermission(Permission.ADVANCES, Permission.REPORTS),
  asyncHandler(exportController.exportAdvanceReport)
);
router.get(
  "/advance-statement",
  requirePermission(Permission.ADVANCES, Permission.REPORTS),
  asyncHandler(exportController.exportAdvanceStatement)
);
router.get(
  "/deferred-statement",
  requirePermission(Permission.SALARIES, Permission.REPORTS),
  asyncHandler(exportController.exportDeferredStatement)
);
router.get(
  "/skipped-statement",
  requirePermission(Permission.SALARIES, Permission.REPORTS),
  asyncHandler(exportController.exportSkippedStatement)
);

export default router;
