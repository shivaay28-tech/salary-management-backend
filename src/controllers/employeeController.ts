import { Response } from "express";
import { z } from "zod";
import { Employee } from "../models/Employee";
import { EmployeeStatus } from "../types/enums";
import { AuthRequest } from "../middleware/auth";
import { assertOfficeAccess } from "../middleware/rbac";
import { AppError } from "../middleware/errorHandler";
import { logAudit } from "../services/auditService";
import { saveEmployeePhoto } from "../services/uploadService";
import {
  importEmployeesFromExcel,
  sendEmployeeImportTemplate,
} from "../services/employeeImportService";
import { getOfficeIdFilter } from "../utils/officeFilter";

const bankSchema = z.object({
  bankName: z.string().min(1),
  accountHolderName: z.string().min(1),
  accountNumber: z.string().min(1),
  ifscCode: z.string().min(1),
  branch: z.string().min(1),
});

const angadiyaSchema = z.object({
  name: z.string().min(1),
  number: z.string().min(10),
  angadiyaNumber: z.string().min(1),
  amount: z.coerce.number().min(0),
  city: z.string().min(1),
});

const employeeBaseSchema = z.object({
  fullName: z.string().min(2),
  mobileNumber: z.string().min(10),
  dateOfJoining: z.coerce.date(),
  officeId: z.string(),
  monthlySalary: z.coerce.number().min(0),
  status: z.nativeEnum(EmployeeStatus).optional(),
  outDate: z.coerce.date().optional(),
  bankDetails: bankSchema.optional(),
  angadiyaDetails: angadiyaSchema.optional(),
});

const employeeCreateSchema = employeeBaseSchema;
const employeeUpdateSchema = employeeBaseSchema.partial();

export async function listEmployees(req: AuthRequest, res: Response): Promise<void> {
  const filter: Record<string, unknown> = { ...getOfficeIdFilter(req) };
  if (req.query.officeId) {
    const officeId = String(req.query.officeId);
    assertOfficeAccess(req, officeId);
    filter.officeId = officeId;
  }
  if (req.query.status) {
    filter.status = String(req.query.status);
  }
  if (req.query.name) {
    const name = String(req.query.name).trim();
    if (name) {
      filter.fullName = { $regex: name, $options: "i" };
    }
  }

  const employees = await Employee.find(filter)
    .populate("officeId", "name")
    .sort({ createdAt: -1 });

  res.json({ success: true, data: employees });
}

export async function getEmployee(req: AuthRequest, res: Response): Promise<void> {
  const employee = await Employee.findById(String(req.params.id)).populate(
    "officeId",
    "name"
  );
  if (!employee) {
    throw new AppError("Employee not found", 404);
  }
  assertOfficeAccess(req, employee.officeId.toString());
  res.json({ success: true, data: employee });
}

export async function createEmployee(req: AuthRequest, res: Response): Promise<void> {
  const parsed = employeeCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  assertOfficeAccess(req, parsed.data.officeId);

  const employee = await Employee.create({
    ...parsed.data,
    status: parsed.data.status ?? EmployeeStatus.ACTIVE,
  });

  if (req.user) {
    await logAudit(req.user, "Employee Created", "employees", {
      employeeId: employee._id,
      name: employee.fullName,
    });
  }

  const result = await Employee.findById(employee._id).populate("officeId", "name");
  res.status(201).json({ success: true, data: result });
}

export async function updateEmployee(req: AuthRequest, res: Response): Promise<void> {
  const parsed = employeeUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const employee = await Employee.findById(String(req.params.id));
  if (!employee) {
    throw new AppError("Employee not found", 404);
  }
  assertOfficeAccess(req, employee.officeId.toString());
  if (parsed.data.officeId) {
    assertOfficeAccess(req, parsed.data.officeId);
  }

  Object.assign(employee, parsed.data);
  await employee.save();

  if (req.user) {
    await logAudit(req.user, "Employee Updated", "employees", {
      employeeId: employee._id,
    });
  }

  const result = await Employee.findById(employee._id).populate("officeId", "name");
  res.json({ success: true, data: result });
}

export async function deleteEmployee(req: AuthRequest, res: Response): Promise<void> {
  const employee = await Employee.findByIdAndDelete(String(req.params.id));
  if (!employee) {
    throw new AppError("Employee not found", 404);
  }
  assertOfficeAccess(req, employee.officeId.toString());

  if (req.user) {
    await logAudit(req.user, "Employee Deleted", "employees", {
      employeeId: employee._id,
    });
  }

  res.json({ success: true, message: "Employee deleted" });
}

export async function downloadImportTemplate(
  req: AuthRequest,
  res: Response
): Promise<void> {
  void req;
  await sendEmployeeImportTemplate(res);
}

export async function importEmployees(
  req: AuthRequest,
  res: Response
): Promise<void> {
  if (!req.file) {
    throw new AppError("Excel file required", 400);
  }

  const result = await importEmployeesFromExcel(req, req.file.buffer);
  res.json({ success: true, data: result });
}

export async function uploadPhoto(req: AuthRequest, res: Response): Promise<void> {
  const employee = await Employee.findById(String(req.params.id));
  if (!employee) {
    throw new AppError("Employee not found", 404);
  }
  assertOfficeAccess(req, employee.officeId.toString());

  if (!req.file) {
    throw new AppError("Photo file required", 400);
  }

  const photoUrl = await saveEmployeePhoto(req.file);
  employee.photoUrl = photoUrl;
  await employee.save();

  if (req.user) {
    await logAudit(req.user, "Employee Photo Updated", "employees", {
      employeeId: employee._id,
    });
  }

  res.json({ success: true, data: { photoUrl } });
}
