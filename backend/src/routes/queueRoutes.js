import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  getAllQueues,
  getQueueById,
} from "../controllers/queueController.js";

const router = express.Router();

router.get("/", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST"]), getAllQueues);
router.get("/:id", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST"]), getQueueById);

export default router;
