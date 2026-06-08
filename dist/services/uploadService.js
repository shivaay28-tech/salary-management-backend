"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.photoUpload = void 0;
exports.saveEmployeePhoto = saveEmployeePhoto;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const cloudinary_1 = require("cloudinary");
const env_1 = require("../config/env");
const UPLOAD_DIR = path_1.default.join(process.cwd(), "uploads", "employees");
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024;
const cloudinaryConfigured = !!env_1.env.cloudinary.cloudName &&
    !!env_1.env.cloudinary.apiKey &&
    !!env_1.env.cloudinary.apiSecret;
if (cloudinaryConfigured) {
    cloudinary_1.v2.config({
        cloud_name: env_1.env.cloudinary.cloudName,
        api_key: env_1.env.cloudinary.apiKey,
        api_secret: env_1.env.cloudinary.apiSecret,
    });
}
exports.photoUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: MAX_SIZE },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_TYPES.includes(file.mimetype)) {
            cb(new Error("Only JPG, PNG, and WEBP images are allowed"));
            return;
        }
        cb(null, true);
    },
});
async function saveEmployeePhoto(file) {
    if (cloudinaryConfigured) {
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary_1.v2.uploader.upload_stream({ folder: "salary-management/employees", resource_type: "image" }, (err, res) => {
                if (err || !res)
                    reject(err ?? new Error("Upload failed"));
                else
                    resolve(res);
            });
            stream.end(file.buffer);
        });
        return result.secure_url;
    }
    if (!fs_1.default.existsSync(UPLOAD_DIR)) {
        fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    const ext = path_1.default.extname(file.originalname) || ".jpg";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filepath = path_1.default.join(UPLOAD_DIR, filename);
    fs_1.default.writeFileSync(filepath, file.buffer);
    return `/uploads/employees/${filename}`;
}
