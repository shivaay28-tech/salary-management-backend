"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
const jwt_1 = require("../utils/jwt");
const errorHandler_1 = require("./errorHandler");
function authenticate(req, _res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        throw new errorHandler_1.AppError("Unauthorized", 401);
    }
    const token = header.split(" ")[1];
    try {
        req.user = (0, jwt_1.verifyAccessToken)(token);
        next();
    }
    catch {
        throw new errorHandler_1.AppError("Invalid or expired token", 401);
    }
}
