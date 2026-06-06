import { Router } from "express";
import * as userController from "../controllers/userController";
import { authenticate } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { UserRole } from "../types/enums";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate, requireRoles(UserRole.SUPER_ADMIN));

router.get("/", asyncHandler(userController.listUsers));
router.post("/", asyncHandler(userController.createUser));
router.put("/:id", asyncHandler(userController.updateUser));
router.delete("/:id", asyncHandler(userController.deleteUser));

export default router;
