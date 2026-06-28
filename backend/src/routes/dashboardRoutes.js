import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  getDashboardSummary,
  getPublicDashboardSnapshot,
} from "../controllers/dashboardController.js";

const router = express.Router();

router.get("/public", getPublicDashboardSnapshot);
router.get(
  "/summary",
  authenticate,
  authorize(["ADMIN", "RECEPTIONIST", "DOCTOR", "PATIENT"]),
  getDashboardSummary,
);

export default router;
