import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  createDoctor,
  deleteDoctor,
  getAllDoctors,
  getDoctorsBySpecialtyAndDate,
  getDoctorById,
  updateDoctor,
} from "../controllers/doctorController.js";

const router = express.Router();

router.get("/", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST"]), getAllDoctors);
router.get(
  "/by-specialty-date",
  authenticate,
  authorize(["ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]),
  getDoctorsBySpecialtyAndDate
);
router.get("/:id", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST"]), getDoctorById);
router.post("/", authenticate, authorize(["ADMIN"]), createDoctor);
router.put("/:id", authenticate, authorize(["ADMIN"]), updateDoctor);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deleteDoctor);

export default router;