import { Router } from "express";
import * as advanceController from "../controllers/advanceController";
import { authenticate } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { Permission } from "../types/permissions";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate, requirePermission(Permission.ADVANCES));

router.get("/", asyncHandler(advanceController.listAdvances));
router.get("/statement", asyncHandler(advanceController.getAdvanceStatement));
router.get("/:id", asyncHandler(advanceController.getAdvance));
router.post("/", asyncHandler(advanceController.createAdvance));
router.put("/:id", asyncHandler(advanceController.updateAdvance));
router.delete("/:id", asyncHandler(advanceController.deleteAdvance));

export default router;
