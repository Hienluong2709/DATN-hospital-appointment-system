import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  cancelAppointment,
  checkInAppointment,
  completeAppointment,
  confirmAppointment,
  createAppointment,
  deleteAppointment,
  getDoctorAvailability,
  getAllAppointments,
  getAppointmentById,
  rescheduleAppointment,
  startAppointment,
} from "../controllers/appointmentController.js";

const router = express.Router();

router.get("/", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), getAllAppointments);
router.get("/doctor/:doctorId/availability", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), getDoctorAvailability);
router.get("/:id", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), getAppointmentById);
router.post("/", authenticate, authorize(["ADMIN", "RECEPTIONIST", "PATIENT"]), createAppointment);
router.post("/:id/confirm", authenticate, authorize(["ADMIN", "RECEPTIONIST"]), confirmAppointment);
router.post("/:id/cancel", authenticate, authorize(["ADMIN", "RECEPTIONIST", "PATIENT"]), cancelAppointment);
router.post("/:id/check-in", authenticate, authorize(["ADMIN", "RECEPTIONIST"]), checkInAppointment);
router.post("/:id/reschedule", authenticate, authorize(["ADMIN", "RECEPTIONIST"]), rescheduleAppointment);
router.post("/:id/start", authenticate, authorize(["DOCTOR"]), startAppointment);
router.post("/:id/completed", authenticate, authorize(["DOCTOR"]), completeAppointment);
router.delete("/:id", authenticate, authorize(["ADMIN", "RECEPTIONIST"]), deleteAppointment);

export default router;
