"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.errorHandler = errorHandler;
class AppError extends Error {
    statusCode;
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}
exports.AppError = AppError;
function errorHandler(err, _req, res, _next) {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
    }
    if (err.name === "ValidationError") {
        res.status(400).json({ success: false, message: err.message });
        return;
    }
    if (err.code === 11000) {
        res.status(409).json({ success: false, message: "Duplicate entry found" });
        return;
    }
    console.error(err);
    res.status(500).json({ success: false, message: "Internal server error" });
}
