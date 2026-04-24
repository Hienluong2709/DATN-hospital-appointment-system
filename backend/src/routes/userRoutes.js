import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  createUser,
  deleteUser,
  getAllUsers,
  getCurrentUser,
  getUserById,
  updateCurrentUser,
  updateUser,
} from "../controllers/userController.js";

const router = express.Router();

router.get("/me", authenticate, getCurrentUser);
router.put("/me", authenticate, authorize(["ADMIN", "PATIENT", "DOCTOR", "RECEPTIONIST"]), updateCurrentUser);
router.get("/", authenticate, authorize(["ADMIN"]), getAllUsers);
router.get("/:id", authenticate, authorize(["ADMIN"]), getUserById);
router.post("/", authenticate, authorize(["ADMIN"]), createUser);
router.put("/:id", authenticate, authorize(["ADMIN"]), updateUser);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deleteUser);

export default router;
