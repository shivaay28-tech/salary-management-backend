"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.refresh = refresh;
exports.logout = logout;
exports.me = me;
exports.changePassword = changePassword;
const zod_1 = require("zod");
const User_1 = require("../models/User");
const password_1 = require("../utils/password");
const jwt_1 = require("../utils/jwt");
const errorHandler_1 = require("../middleware/errorHandler");
const permissions_1 = require("../types/permissions");
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
function toOfficeIdStrings(assignedOfficeIds) {
    return assignedOfficeIds.map((officeId) => {
        if (typeof officeId === "string")
            return officeId;
        if (officeId &&
            typeof officeId === "object" &&
            "_id" in officeId &&
            officeId._id) {
            return officeId._id.toString();
        }
        return officeId.toString();
    });
}
function buildTokenPayload(user) {
    return {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        assignedOfficeIds: toOfficeIdStrings(user.assignedOfficeIds),
        permissions: (0, permissions_1.resolvePermissions)(user.permissions),
    };
}
function serializeUser(user) {
    return {
        id: typeof user._id === "object" && user._id !== null && "toString" in user._id
            ? user._id.toString()
            : String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        assignedOfficeIds: user.assignedOfficeIds,
        permissions: (0, permissions_1.resolvePermissions)(user.permissions),
    };
}
async function login(req, res) {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const user = await User_1.User.findOne({ email: parsed.data.email })
        .select("+password")
        .populate("assignedOfficeIds", "name");
    if (!user || !user.isActive) {
        throw new errorHandler_1.AppError("Invalid email or password", 401);
    }
    const valid = await (0, password_1.comparePassword)(parsed.data.password, user.password);
    if (!valid) {
        throw new errorHandler_1.AppError("Invalid email or password", 401);
    }
    const payload = buildTokenPayload(user);
    const accessToken = (0, jwt_1.signAccessToken)(payload);
    const refreshToken = (0, jwt_1.signRefreshToken)(payload);
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
async function refresh(req, res) {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        throw new errorHandler_1.AppError("Refresh token required", 400);
    }
    let payload;
    try {
        payload = (0, jwt_1.verifyRefreshToken)(refreshToken);
    }
    catch {
        throw new errorHandler_1.AppError("Invalid refresh token", 401);
    }
    const user = await User_1.User.findById(payload.userId).select("+refreshToken");
    if (!user || user.refreshToken !== refreshToken || !user.isActive) {
        throw new errorHandler_1.AppError("Invalid refresh token", 401);
    }
    const newPayload = buildTokenPayload(user);
    const accessToken = (0, jwt_1.signAccessToken)(newPayload);
    const newRefreshToken = (0, jwt_1.signRefreshToken)(newPayload);
    user.refreshToken = newRefreshToken;
    await user.save();
    res.json({
        success: true,
        data: { accessToken, refreshToken: newRefreshToken },
    });
}
async function logout(req, res) {
    if (req.user) {
        await User_1.User.findByIdAndUpdate(req.user.userId, { $unset: { refreshToken: 1 } });
    }
    res.json({ success: true, message: "Logged out" });
}
async function me(req, res) {
    const user = await User_1.User.findById(req.user?.userId).populate("assignedOfficeIds", "name status");
    if (!user || !user.isActive) {
        throw new errorHandler_1.AppError("User not found", 404);
    }
    const accessToken = (0, jwt_1.signAccessToken)(buildTokenPayload(user));
    res.json({
        success: true,
        data: {
            user: serializeUser(user),
            accessToken,
        },
    });
}
async function changePassword(req, res) {
    const schema = zod_1.z.object({
        currentPassword: zod_1.z.string().min(6),
        newPassword: zod_1.z.string().min(6),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        throw new errorHandler_1.AppError("Invalid input");
    }
    const user = await User_1.User.findById(req.user?.userId).select("+password");
    if (!user) {
        throw new errorHandler_1.AppError("User not found", 404);
    }
    const valid = await (0, password_1.comparePassword)(parsed.data.currentPassword, user.password);
    if (!valid) {
        throw new errorHandler_1.AppError("Current password is incorrect", 400);
    }
    user.password = await (0, password_1.hashPassword)(parsed.data.newPassword);
    await user.save();
    res.json({ success: true, message: "Password updated" });
}
