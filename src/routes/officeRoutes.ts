import { Router } from "express";
import * as officeController from "../controllers/officeController";
import { authenticate } from "../middleware/auth";
import { requirePermission, requireRoles } from "../middleware/rbac";
import { UserRole } from "../types/enums";
import { Permission } from "../types/permissions";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate);

router.get("/", asyncHandler(officeController.listOffices));
router.get("/:id", asyncHandler(officeController.getOffice));

router.post(
  "/",
  requireRoles(UserRole.SUPER_ADMIN),
  asyncHandler(officeController.createOffice)
);
router.put(
  "/:id",
  requirePermission(Permission.OFFICES),
  asyncHandler(officeController.updateOffice)
);
router.delete(
  "/:id",
  requireRoles(UserRole.SUPER_ADMIN),
  asyncHandler(officeController.deleteOffice)
);

export default router;
