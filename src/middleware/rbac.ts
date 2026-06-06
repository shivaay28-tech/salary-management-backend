import { NextFunction, Response } from "express";
import { UserRole } from "../types/enums";
import {
  ALL_PERMISSIONS,
  Permission,
  resolvePermissions,
} from "../types/permissions";
import { AuthRequest } from "./auth";
import { AppError } from "./errorHandler";

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError("Forbidden", 403);
    }
    next();
  };
}

export function canAccessOffice(officeId: string, req: AuthRequest): boolean {
  if (!req.user) return false;
  if (req.user.role === UserRole.SUPER_ADMIN) return true;
  return req.user.assignedOfficeIds.includes(officeId);
}

export function assertOfficeAccess(req: AuthRequest, officeId: string): void {
  if (!canAccessOffice(officeId, req)) {
    throw new AppError("You do not have access to this office", 403);
  }
}

export function hasPermission(
  req: AuthRequest,
  permission: Permission
): boolean {
  if (!req.user) return false;
  if (req.user.role === UserRole.SUPER_ADMIN) return true;
  return resolvePermissions(req.user.permissions).includes(permission);
}

export function requirePermission(...permissions: Permission[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }
    if (req.user.role === UserRole.SUPER_ADMIN) {
      next();
      return;
    }
    const userPerms = resolvePermissions(req.user.permissions ?? ALL_PERMISSIONS);
    if (!permissions.some((p) => userPerms.includes(p))) {
      throw new AppError("Forbidden", 403);
    }
    next();
  };
}
