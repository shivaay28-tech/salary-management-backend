"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUsers = listUsers;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
const zod_1 = require("zod");
const User_1 = require("../models/User");
const enums_1 = require("../types/enums");
const password_1 = require("../utils/password");
const errorHandler_1 = require("../middleware/errorHandler");
const auditService_1 = require("../services/auditService");
const createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    role: zod_1.z.literal(enums_1.UserRole.SUB_ADMIN),
    assignedOfficeIds: zod_1.z.array(zod_1.z.string()).min(1),
});
const updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    email: zod_1.z.string().email().optional(),
    password: zod_1.z.string().min(6).optional(),
    assignedOfficeIds: zod_1.z.array(zod_1.z.string()).optional(),
    isActive: zod_1.z.boolean().optional(),
});
async function listUsers(req, res) {
    const users = await User_1.User.find({ role: enums_1.UserRole.SUB_ADMIN })
        .select("-password -refreshToken")
        .populate("assignedOfficeIds", "name")
        .sort({ createdAt: -1 });
    res.json({ success: true, data: users });
}
async function createUser(req, res) {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const existing = await User_1.User.findOne({ email: parsed.data.email });
    if (existing) {
        throw new errorHandler_1.AppError("Email already in use", 409);
    }
    const user = await User_1.User.create({
        name: parsed.data.name,
        email: parsed.data.email,
        password: await (0, password_1.hashPassword)(parsed.data.password),
        role: enums_1.UserRole.SUB_ADMIN,
        assignedOfficeIds: parsed.data.assignedOfficeIds,
    });
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Sub Admin Created", "users", {
            userId: user._id,
            email: user.email,
        });
    }
    const result = await User_1.User.findById(user._id)
        .select("-password -refreshToken")
        .populate("assignedOfficeIds", "name");
    res.status(201).json({ success: true, data: result });
}
async function updateUser(req, res) {
    const id = String(req.params.id);
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Invalid input");
    }
    const user = await User_1.User.findOne({ _id: id, role: enums_1.UserRole.SUB_ADMIN });
    if (!user) {
        throw new errorHandler_1.AppError("Sub admin not found", 404);
    }
    if (parsed.data.name)
        user.name = parsed.data.name;
    if (parsed.data.email)
        user.email = parsed.data.email;
    if (parsed.data.assignedOfficeIds) {
        user.assignedOfficeIds = parsed.data.assignedOfficeIds;
    }
    if (parsed.data.isActive !== undefined)
        user.isActive = parsed.data.isActive;
    if (parsed.data.password) {
        user.password = await (0, password_1.hashPassword)(parsed.data.password);
    }
    await user.save();
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Sub Admin Updated", "users", { userId: id });
    }
    const result = await User_1.User.findById(id)
        .select("-password -refreshToken")
        .populate("assignedOfficeIds", "name");
    res.json({ success: true, data: result });
}
async function deleteUser(req, res) {
    const id = String(req.params.id);
    const user = await User_1.User.findOneAndDelete({
        _id: id,
        role: enums_1.UserRole.SUB_ADMIN,
    });
    if (!user) {
        throw new errorHandler_1.AppError("Sub admin not found", 404);
    }
    if (req.user) {
        await (0, auditService_1.logAudit)(req.user, "Sub Admin Deleted", "users", { userId: id });
    }
    res.json({ success: true, message: "Sub admin deleted" });
}
