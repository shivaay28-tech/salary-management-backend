"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function requireEnv(key, fallback) {
    const value = process.env[key] ?? fallback;
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}
exports.env = {
    port: parseInt(process.env.PORT ?? "5000", 10),
    nodeEnv: process.env.NODE_ENV ?? "development",
    mongoUri: requireEnv("MONGODB_URI", "mongodb://localhost:27017/salary_management"),
    jwtAccessSecret: requireEnv("JWT_ACCESS_SECRET", "dev-access-secret-change-in-production"),
    jwtRefreshSecret: requireEnv("JWT_REFRESH_SECRET", "dev-refresh-secret-change-in-production"),
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
    clientUrl: process.env.CLIENT_URL ?? "http://localhost:3000",
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
        apiKey: process.env.CLOUDINARY_API_KEY ?? "",
        apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
    },
};
