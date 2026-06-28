import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  createWorkScheduleBlock,
  deleteWorkScheduleBlock,
  getAllWorkScheduleBlocks,
  getWorkScheduleBlockById,
  reviewWorkScheduleBlock,
  updateWorkScheduleBlock,
} from "../controllers/workScheduleBlockController.js";

const router = express.Router();

router.get("/", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST"]), getAllWorkScheduleBlocks);
router.get("/:id", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST"]), getWorkScheduleBlockById);
router.post("/", authenticate, authorize(["DOCTOR"]), createWorkScheduleBlock);
router.put("/:id", authenticate, authorize(["DOCTOR"]), updateWorkScheduleBlock);
router.patch("/:id/review", authenticate, authorize(["ADMIN"]), reviewWorkScheduleBlock);
router.delete("/:id", authenticate, authorize(["DOCTOR"]), deleteWorkScheduleBlock);

export default router;
