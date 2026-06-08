import { Response } from "express";
import { z } from "zod";
import { Office } from "../models/Office";
import { OfficeStatus } from "../types/enums";
import { AuthRequest } from "../middleware/auth";
import { assertOfficeAccess } from "../middleware/rbac";
import { AppError } from "../middleware/errorHandler";
import { logAudit } from "../services/auditService";

const officeSchema = z.object({
  name: z.string().min(2),
  contactNumber: z.string().min(10),
  status: z.nativeEnum(OfficeStatus).optional(),
});

export async function listOffices(req: AuthRequest, res: Response): Promise<void> {
  const filter =
    req.user?.role === "sub_admin"
      ? { _id: { $in: req.user.assignedOfficeIds } }
      : {};

  const offices = await Office.find(filter).sort({ name: 1 });
  res.json({ success: true, data: offices });
}

export async function getOffice(req: AuthRequest, res: Response): Promise<void> {
  const id = String(req.params.id);
  assertOfficeAccess(req, id);
  const office = await Office.findById(id);
  if (!office) {
    throw new AppError("Office not found", 404);
  }
  res.json({ success: true, data: office });
}

export async function createOffice(req: AuthRequest, res: Response): Promise<void> {
  const parsed = officeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const office = await Office.create({
    ...parsed.data,
    status: parsed.data.status ?? OfficeStatus.ACTIVE,
  });

  if (req.user) {
    await logAudit(req.user, "Office Created", "offices", {
      officeId: office._id,
      name: office.name,
    });
  }

  res.status(201).json({ success: true, data: office });
}

export async function updateOffice(req: AuthRequest, res: Response): Promise<void> {
  const id = String(req.params.id);
  assertOfficeAccess(req, id);
  const parsed = officeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("Invalid input");
  }

  const office = await Office.findByIdAndUpdate(id, parsed.data, {
    new: true,
    runValidators: true,
  });
  if (!office) {
    throw new AppError("Office not found", 404);
  }

  if (req.user) {
    await logAudit(req.user, "Office Updated", "offices", { officeId: id });
  }

  res.json({ success: true, data: office });
}

export async function deleteOffice(req: AuthRequest, res: Response): Promise<void> {
  const id = String(req.params.id);
  assertOfficeAccess(req, id);
  const office = await Office.findByIdAndDelete(id);
  if (!office) {
    throw new AppError("Office not found", 404);
  }

  if (req.user) {
    await logAudit(req.user, "Office Deleted", "offices", { officeId: id });
  }

  res.json({ success: true, message: "Office deleted" });
}
