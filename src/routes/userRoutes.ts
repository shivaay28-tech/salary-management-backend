import { Router } from "express";
import * as userController from "../controllers/userController";
import { authenticate } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { Permission } from "../types/permissions";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate, requirePermission(Permission.USERS));

router.get("/", asyncHandler(userController.listUsers));
router.post("/", asyncHandler(userController.createUser));
router.put("/:id", asyncHandler(userController.updateUser));
router.delete("/:id", asyncHandler(userController.deleteUser));

export default router;
