import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  createRoom,
  deleteRoom,
  getAllRooms,
  getRoomById,
  updateRoom,
} from "../controllers/roomController.js";

const router = express.Router();

router.get("/", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST"]), getAllRooms);
router.get("/:id", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST"]), getRoomById);
router.post("/", authenticate, authorize(["ADMIN"]), createRoom);
router.put("/:id", authenticate, authorize(["ADMIN"]), updateRoom);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deleteRoom);

export default router;
