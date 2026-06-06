import { Response } from "express";
import { z } from "zod";
import { User } from "../models/User";
import { UserRole } from "../types/enums";
import { hashPassword } from "../utils/password";
import { AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { logAudit } from "../services/auditService";
import { ALL_PERMISSIONS, Permission } from "../types/permissions";

const permissionSchema = z.array(
  z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])
);

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.literal(UserRole.SUB_ADMIN),
  assignedOfficeIds: z.array(z.string()).min(1),
  permissions: permissionSchema.min(1),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  assignedOfficeIds: z.array(z.string()).optional(),
  permissions: permissionSchema.min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function listUsers(req: AuthRequest, res: Response): Promise<void> {
  const users = await User.find({ role: UserRole.SUB_ADMIN })
    .select("-password -refreshToken")
    .populate("assignedOfficeIds", "name")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: users });
}

export async function createUser(req: AuthRequest, res: Response): Promise<void> {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const existing = await User.findOne({ email: parsed.data.email });
  if (existing) {
    throw new AppError("Email already in use", 409);
  }

  const user = await User.create({
    name: parsed.data.name,
    email: parsed.data.email,
    password: await hashPassword(parsed.data.password),
    role: UserRole.SUB_ADMIN,
    assignedOfficeIds: parsed.data.assignedOfficeIds,
    permissions: parsed.data.permissions,
  });

  if (req.user) {
    await logAudit(req.user, "Sub Admin Created", "users", {
      userId: user._id,
      email: user.email,
    });
  }

  const result = await User.findById(user._id)
    .select("-password -refreshToken")
    .populate("assignedOfficeIds", "name");

  res.status(201).json({ success: true, data: result });
}

export async function updateUser(req: AuthRequest, res: Response): Promise<void> {
  const id = String(req.params.id);
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("Invalid input");
  }

  const user = await User.findOne({ _id: id, role: UserRole.SUB_ADMIN });
  if (!user) {
    throw new AppError("Sub admin not found", 404);
  }

  if (parsed.data.name) user.name = parsed.data.name;
  if (parsed.data.email) user.email = parsed.data.email;
  if (parsed.data.assignedOfficeIds) {
    user.assignedOfficeIds = parsed.data.assignedOfficeIds as never;
  }
  if (parsed.data.permissions) {
    user.permissions = parsed.data.permissions;
  }
  if (parsed.data.isActive !== undefined) user.isActive = parsed.data.isActive;
  if (parsed.data.password) {
    user.password = await hashPassword(parsed.data.password);
  }

  await user.save();

  if (req.user) {
    await logAudit(req.user, "Sub Admin Updated", "users", { userId: id });
  }

  const result = await User.findById(id)
    .select("-password -refreshToken")
    .populate("assignedOfficeIds", "name");

  res.json({ success: true, data: result });
}

export async function deleteUser(req: AuthRequest, res: Response): Promise<void> {
  const id = String(req.params.id);
  const user = await User.findOneAndDelete({
    _id: id,
    role: UserRole.SUB_ADMIN,
  });
  if (!user) {
    throw new AppError("Sub admin not found", 404);
  }

  if (req.user) {
    await logAudit(req.user, "Sub Admin Deleted", "users", { userId: id });
  }

  res.json({ success: true, message: "Sub admin deleted" });
}
