import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  createEQueueNumber,
  deleteEQueueNumber,
  getAllEQueueNumbers,
  getEQueueNumberByDate,
  getEQueueNumberById,
  resetEQueueNumber,
  updateEQueueNumber,
} from "../controllers/equeueNumberController.js";

const router = express.Router();

router.get("/", authenticate, authorize(["ADMIN", "RECEPTIONIST", "DOCTOR"]), getAllEQueueNumbers);
router.get("/by-date", authenticate, authorize(["ADMIN", "RECEPTIONIST", "DOCTOR"]), getEQueueNumberByDate);
router.get("/:id", authenticate, authorize(["ADMIN", "RECEPTIONIST", "DOCTOR"]), getEQueueNumberById);
router.post("/", authenticate, authorize(["ADMIN", "RECEPTIONIST"]), createEQueueNumber);
router.post("/reset", authenticate, authorize(["ADMIN", "RECEPTIONIST"]), resetEQueueNumber);
router.put("/:id", authenticate, authorize(["ADMIN", "RECEPTIONIST"]), updateEQueueNumber);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deleteEQueueNumber);

export default router;