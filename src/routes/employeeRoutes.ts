import { Router } from "express";
import * as employeeController from "../controllers/employeeController";
import { authenticate } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { Permission } from "../types/permissions";
import { asyncHandler } from "../utils/asyncHandler";
import { photoUpload } from "../services/uploadService";

const router = Router();

router.use(authenticate, requirePermission(Permission.EMPLOYEES));

router.get("/", asyncHandler(employeeController.listEmployees));
router.get("/:id", asyncHandler(employeeController.getEmployee));
router.post("/", asyncHandler(employeeController.createEmployee));
router.put("/:id", asyncHandler(employeeController.updateEmployee));
router.delete("/:id", asyncHandler(employeeController.deleteEmployee));
router.post(
  "/:id/photo",
  photoUpload.single("photo"),
  asyncHandler(employeeController.uploadPhoto)
);

export default router;
