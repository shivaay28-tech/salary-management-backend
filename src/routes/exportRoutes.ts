import { Router } from "express";
import * as exportController from "../controllers/exportController";
import { authenticate } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { Permission } from "../types/permissions";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate, requirePermission(Permission.REPORTS));

router.get("/salary", asyncHandler(exportController.exportSalaryReport));
router.get("/employees", asyncHandler(exportController.exportEmployeeList));
router.get("/advances", asyncHandler(exportController.exportAdvanceReport));
router.get(
  "/advance-statement",
  asyncHandler(exportController.exportAdvanceStatement)
);
router.get(
  "/deferred-statement",
  asyncHandler(exportController.exportDeferredStatement)
);
router.get(
  "/skipped-statement",
  asyncHandler(exportController.exportSkippedStatement)
);

export default router;
