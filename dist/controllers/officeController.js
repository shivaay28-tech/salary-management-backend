"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listOffices = listOffices;
exports.getOffice = getOffice;
exports.createOffice = createOffice;
exports.updateOffice = updateOffice;
exports.deleteOffice = deleteOffice;
const zod_1 = require("zod");
const Office_1 = require("../models/Office");
const enums_1 = require("../types/enums");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
const auditService_1 = require("../services/auditService");
const officeSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    contactNumber: zod_1.z.string().min(10),
    status: zod_1.z.nativeEnum(enums_1.OfficeStatus).optional(),
});
async function listOffices(req, res) {
    const filter = req.user?.role === "sub_admin"
        ? { _id: { $in: req.user.assignedOfficeIds } }
        : {};
    const offices = await Office_1.Office.find(filter).sort({ name: 1 });
    res.json({ success: true, data: offices });
}
async function getOffice(req, res) {
    const id = String(req.params.id);
    (0, rbac_1.assertOfficeAccess)(req, id);
    const office = await Office_1.Office.findById(id);
    if (!office) {
        throw new errorHandler_1.AppError("Office not found", 404);
    }
    res.json({ success: true, data: office });
}
async function createOffice(req, res) {
    const parsed = officeSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const office = await Office_1.Office.create({
        ...parsed.data,
        status: parsed.data.status ?? enums_1.OfficeStatus.ACTIVE,
    });
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Office Created", "offices", {
            officeId: office._id,
            name: office.name,
        });
    }
    res.status(201).json({ success: true, data: office });
}
async function updateOffice(req, res) {
    const id = String(req.params.id);
    (0, rbac_1.assertOfficeAccess)(req, id);
    const parsed = officeSchema.partial().safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Invalid input");
    }
    const office = await Office_1.Office.findByIdAndUpdate(id, parsed.data, {
        new: true,
        runValidators: true,
    });
    if (!office) {
        throw new errorHandler_1.AppError("Office not found", 404);
    }
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Office Updated", "offices", { officeId: id });
    }
    res.json({ success: true, data: office });
}
async function deleteOffice(req, res) {
    const id = String(req.params.id);
    (0, rbac_1.assertOfficeAccess)(req, id);
    const office = await Office_1.Office.findByIdAndDelete(id);
    if (!office) {
        throw new errorHandler_1.AppError("Office not found", 404);
    }
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Office Deleted", "offices", { officeId: id });
    }
    res.json({ success: true, message: "Office deleted" });
}
