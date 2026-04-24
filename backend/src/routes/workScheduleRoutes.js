import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  createWorkSchedule,
  deleteWorkSchedule,
  getAllWorkSchedules,
  getWorkScheduleById,
  updateWorkSchedule,
} from "../controllers/workScheduleController.js";

const router = express.Router();

router.get("/", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST"]), getAllWorkSchedules);
router.get("/:id", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST"]), getWorkScheduleById);
router.post("/", authenticate, authorize(["ADMIN"]), createWorkSchedule);
router.put("/:id", authenticate, authorize(["ADMIN"]), updateWorkSchedule);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deleteWorkSchedule);

export default router;