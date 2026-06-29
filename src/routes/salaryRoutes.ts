import { Router } from "express";
import * as salaryController from "../controllers/salaryController";
import { authenticate } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { Permission } from "../types/permissions";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate);

router.get(
  "/deferred-statement",
  requirePermission(Permission.SALARIES, Permission.REPORTS),
  asyncHandler(salaryController.getDeferredStatement)
);
router.get(
  "/skipped-statement",
  requirePermission(Permission.SALARIES, Permission.REPORTS),
  asyncHandler(salaryController.getSkippedStatement)
);

router.use(requirePermission(Permission.SALARIES));

router.post("/deferred", asyncHandler(salaryController.createManualDeferred));

router.get("/", asyncHandler(salaryController.listSalaries));
router.post("/generate", asyncHandler(salaryController.generateSalaries));
router.post("/pay-all", asyncHandler(salaryController.markAllSalariesPaid));
router.get("/:id/advance-info", asyncHandler(salaryController.getSalaryAdvanceInfo));
router.get("/:id", asyncHandler(salaryController.getSalary));
router.put("/:id", asyncHandler(salaryController.updateSalary));
router.post("/:id/defer", asyncHandler(salaryController.deferSalary));
router.post("/:id/skip", asyncHandler(salaryController.skipSalary));
router.post("/:id/pay", asyncHandler(salaryController.markSalaryPaid));

export default router;
