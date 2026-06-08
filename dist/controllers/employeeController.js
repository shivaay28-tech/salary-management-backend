"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listEmployees = listEmployees;
exports.getEmployee = getEmployee;
exports.createEmployee = createEmployee;
exports.updateEmployee = updateEmployee;
exports.deleteEmployee = deleteEmployee;
exports.uploadPhoto = uploadPhoto;
const zod_1 = require("zod");
const Employee_1 = require("../models/Employee");
const enums_1 = require("../types/enums");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
const auditService_1 = require("../services/auditService");
const uploadService_1 = require("../services/uploadService");
const officeFilter_1 = require("../utils/officeFilter");
const bankSchema = zod_1.z.object({
    bankName: zod_1.z.string().min(1),
    accountHolderName: zod_1.z.string().min(1),
    accountNumber: zod_1.z.string().min(1),
    ifscCode: zod_1.z.string().min(1),
    branch: zod_1.z.string().min(1),
});
const angadiyaSchema = zod_1.z.object({
    angadiyaName: zod_1.z.string().min(1),
    contactNumber: zod_1.z.string().min(1),
    notes: zod_1.z.string().optional(),
});
const employeeBaseSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2),
    mobileNumber: zod_1.z.string().min(10),
    dateOfJoining: zod_1.z.coerce.date(),
    officeId: zod_1.z.string(),
    monthlySalary: zod_1.z.coerce.number().min(0),
    status: zod_1.z.nativeEnum(enums_1.EmployeeStatus).optional(),
    outDate: zod_1.z.coerce.date().optional(),
    bankDetails: bankSchema.optional(),
    angadiyaDetails: angadiyaSchema.optional(),
});
const employeeCreateSchema = employeeBaseSchema;
const employeeUpdateSchema = employeeBaseSchema.partial();
async function listEmployees(req, res) {
    const filter = { ...(0, officeFilter_1.getOfficeIdFilter)(req) };
    if (req.query.officeId) {
        const officeId = String(req.query.officeId);
        (0, rbac_1.assertOfficeAccess)(req, officeId);
        filter.officeId = officeId;
    }
    if (req.query.status) {
        filter.status = String(req.query.status);
    }
    const employees = await Employee_1.Employee.find(filter)
        .populate("officeId", "name")
        .sort({ createdAt: -1 });
    res.json({ success: true, data: employees });
}
async function getEmployee(req, res) {
    const employee = await Employee_1.Employee.findById(String(req.params.id)).populate("officeId", "name");
    if (!employee) {
        throw new errorHandler_1.AppError("Employee not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, employee.officeId.toString());
    res.json({ success: true, data: employee });
}
async function createEmployee(req, res) {
    const parsed = employeeCreateSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    (0, rbac_1.assertOfficeAccess)(req, parsed.data.officeId);
    const employee = await Employee_1.Employee.create({
        ...parsed.data,
        status: parsed.data.status ?? enums_1.EmployeeStatus.ACTIVE,
    });
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Employee Created", "employees", {
            employeeId: employee._id,
            name: employee.fullName,
        });
    }
    const result = await Employee_1.Employee.findById(employee._id).populate("officeId", "name");
    res.status(201).json({ success: true, data: result });
}
async function updateEmployee(req, res) {
    const parsed = employeeUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const employee = await Employee_1.Employee.findById(String(req.params.id));
    if (!employee) {
        throw new errorHandler_1.AppError("Employee not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, employee.officeId.toString());
    if (parsed.data.officeId) {
        (0, rbac_1.assertOfficeAccess)(req, parsed.data.officeId);
    }
    Object.assign(employee, parsed.data);
    await employee.save();
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Employee Updated", "employees", {
            employeeId: employee._id,
        });
    }
    const result = await Employee_1.Employee.findById(employee._id).populate("officeId", "name");
    res.json({ success: true, data: result });
}
async function deleteEmployee(req, res) {
    const employee = await Employee_1.Employee.findByIdAndDelete(String(req.params.id));
    if (!employee) {
        throw new errorHandler_1.AppError("Employee not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, employee.officeId.toString());
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Employee Deleted", "employees", {
            employeeId: employee._id,
        });
    }
    res.json({ success: true, message: "Employee deleted" });
}
async function uploadPhoto(req, res) {
    const employee = await Employee_1.Employee.findById(String(req.params.id));
    if (!employee) {
        throw new errorHandler_1.AppError("Employee not found", 404);
    }
    (0, rbac_1.assertOfficeAccess)(req, employee.officeId.toString());
    if (!req.file) {
        throw new errorHandler_1.AppError("Photo file required", 400);
    }
    const photoUrl = await (0, uploadService_1.saveEmployeePhoto)(req.file);
    employee.photoUrl = photoUrl;
    await employee.save();
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Employee Photo Updated", "employees", {
            employeeId: employee._id,
        });
    }
    res.json({ success: true, data: { photoUrl } });
}
