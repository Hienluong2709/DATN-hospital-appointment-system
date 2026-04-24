import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  createWorkScheduleBlock,
  deleteWorkScheduleBlock,
  getAllWorkScheduleBlocks,
  getWorkScheduleBlockById,
  updateWorkScheduleBlock,
} from "../controllers/workScheduleBlockController.js";

const router = express.Router();

router.get("/", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST"]), getAllWorkScheduleBlocks);
router.get("/:id", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST"]), getWorkScheduleBlockById);
router.post("/", authenticate, authorize(["ADMIN", "DOCTOR"]), createWorkScheduleBlock);
router.put("/:id", authenticate, authorize(["ADMIN", "DOCTOR"]), updateWorkScheduleBlock);
router.delete("/:id", authenticate, authorize(["ADMIN", "DOCTOR"]), deleteWorkScheduleBlock);

export default router;
