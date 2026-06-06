import { Router } from "express";
import * as auditController from "../controllers/auditController";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate);
router.get("/", asyncHandler(auditController.listAuditLogs));

export default router;
