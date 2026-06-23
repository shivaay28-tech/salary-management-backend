import { Response } from "express";
import { z } from "zod";
import { User } from "../models/User";
import { comparePassword, hashPassword } from "../utils/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  TokenPayload,
} from "../utils/jwt";
import { AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { resolvePermissions } from "../types/permissions";

const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

function toOfficeIdStrings(
  assignedOfficeIds: Array<
    | string
    | { _id?: { toString(): string }; toString(): string }
  >
): string[] {
  return assignedOfficeIds.map((officeId) => {
    if (typeof officeId === "string") return officeId;
    if (
      officeId &&
      typeof officeId === "object" &&
      "_id" in officeId &&
      officeId._id
    ) {
      return officeId._id.toString();
    }
    return officeId.toString();
  });
}

function buildTokenPayload(user: {
  _id: { toString(): string };
  email?: string;
  role: TokenPayload["role"];
  assignedOfficeIds: Array<
    | string
    | { _id?: { toString(): string }; toString(): string }
  >;
  permissions?: TokenPayload["permissions"];
}): TokenPayload {
  return {
    userId: user._id.toString(),
    email: user.email ?? "",
    role: user.role,
    assignedOfficeIds: toOfficeIdStrings(user.assignedOfficeIds),
    permissions: resolvePermissions(user.permissions),
  };
}

function serializeUser(user: {
  _id: unknown;
  name: string;
  username: string;
  email?: string;
  role: string;
  assignedOfficeIds: unknown;
  permissions?: TokenPayload["permissions"];
}) {
  return {
    id:
      typeof user._id === "object" && user._id !== null && "toString" in user._id
        ? user._id.toString()
        : String(user._id),
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    assignedOfficeIds: user.assignedOfficeIds,
    permissions: resolvePermissions(user.permissions),
  };
}

export async function login(req: AuthRequest, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const user = await User.findOne({
    username: parsed.data.username.trim().toLowerCase(),
  })
    .select("+password")
    .populate("assignedOfficeIds", "name");

  if (!user || !user.isActive) {
    throw new AppError("Invalid username or password", 401);
  }

  const valid = await comparePassword(parsed.data.password, user.password);
  if (!valid) {
    throw new AppError("Invalid username or password", 401);
  }

  const payload = buildTokenPayload(user);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  user.refreshToken = refreshToken;
  await user.save();

  res.json({
    success: true,
    data: {
      user: serializeUser(user),
      accessToken,
      refreshToken,
    },
  });
}

export async function refresh(req: AuthRequest, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    throw new AppError("Refresh token required", 400);
  }

  let payload: TokenPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Invalid refresh token", 401);
  }

  const user = await User.findById(payload.userId).select("+refreshToken");
  if (!user || user.refreshToken !== refreshToken || !user.isActive) {
    throw new AppError("Invalid refresh token", 401);
  }

  const newPayload = buildTokenPayload(user);
  const accessToken = signAccessToken(newPayload);
  const newRefreshToken = signRefreshToken(newPayload);

  user.refreshToken = newRefreshToken;
  await user.save();

  res.json({
    success: true,
    data: { accessToken, refreshToken: newRefreshToken },
  });
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  if (req.user) {
    await User.findByIdAndUpdate(req.user.userId, { $unset: { refreshToken: 1 } });
  }
  res.json({ success: true, message: "Logged out" });
}

export async function me(req: AuthRequest, res: Response): Promise<void> {
  const user = await User.findById(req.user?.userId).populate(
    "assignedOfficeIds",
    "name status"
  );
  if (!user || !user.isActive) {
    throw new AppError("User not found", 404);
  }

  const accessToken = signAccessToken(buildTokenPayload(user));

  res.json({
    success: true,
    data: {
      user: serializeUser(user),
      accessToken,
    },
  });
}

export async function changePassword(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const schema = z.object({
    currentPassword: z.string().min(6),
    newPassword: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("Invalid input");
  }

  const user = await User.findById(req.user?.userId).select("+password");
  if (!user) {
    throw new AppError("User not found", 404);
  }

  const valid = await comparePassword(
    parsed.data.currentPassword,
    user.password
  );
  if (!valid) {
    throw new AppError("Current password is incorrect", 400);
  }

  user.password = await hashPassword(parsed.data.newPassword);
  await user.save();

  res.json({ success: true, message: "Password updated" });
}
