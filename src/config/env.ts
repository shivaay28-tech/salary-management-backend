import dotenv from "dotenv";

dotenv.config();

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseClientUrls(): string[] {
  const raw =
    process.env.CLIENT_URLS ??
    process.env.CLIENT_URL ??
    "http://localhost:3000";
  return [...new Set(raw.split(",").map((url) => url.trim()).filter(Boolean))];
}

export const env = {
  port: parseInt(process.env.PORT ?? "5000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  mongoUri: requireEnv("MONGODB_URI", "mongodb://localhost:27017/salary_management"),
  jwtAccessSecret: requireEnv("JWT_ACCESS_SECRET", "dev-access-secret-change-in-production"),
  jwtRefreshSecret: requireEnv("JWT_REFRESH_SECRET", "dev-refresh-secret-change-in-production"),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  clientUrls: parseClientUrls(),
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  },
};
