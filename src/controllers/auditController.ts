import { Response } from "express";
import { AuditLog } from "../models/AuditLog";
import { AuthRequest } from "../middleware/auth";
import { UserRole } from "../types/enums";
import { AppError } from "../middleware/errorHandler";

export async function listAuditLogs(req: AuthRequest, res: Response): Promise<void> {
  if (req.user?.role !== UserRole.SUPER_ADMIN) {
    throw new AppError("Forbidden", 403);
  }

  const filter: Record<string, unknown> = {};
  if (req.query.module) filter.module = String(req.query.module);

  const logs = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(Number(req.query.limit ?? 100));

  res.json({ success: true, data: logs });
}
