import path from "path";
import fs from "fs";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "employees");
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024;

const cloudinaryConfigured =
  !!env.cloudinary.cloudName &&
  !!env.cloudinary.apiKey &&
  !!env.cloudinary.apiSecret;

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
  });
}

const EXCEL_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];
const EXCEL_MAX_SIZE = 10 * 1024 * 1024;

export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      cb(new Error("Only JPG, PNG, and WEBP images are allowed"));
      return;
    }
    cb(null, true);
  },
});

export const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: EXCEL_MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (
      !EXCEL_TYPES.includes(file.mimetype) &&
      ext !== ".xlsx" &&
      ext !== ".xls"
    ) {
      cb(new Error("Only Excel files (.xlsx) are allowed"));
      return;
    }
    cb(null, true);
  },
});

export async function saveEmployeePhoto(
  file: Express.Multer.File
): Promise<string> {
  if (cloudinaryConfigured) {
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "salary-management/employees", resource_type: "image" },
        (err, res) => {
          if (err || !res) reject(err ?? new Error("Upload failed"));
          else resolve(res as { secure_url: string });
        }
      );
      stream.end(file.buffer);
    });
    return result.secure_url;
  }

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const ext = path.extname(file.originalname) || ".jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filepath, file.buffer);
  return `/uploads/employees/${filename}`;
}
