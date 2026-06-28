import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  cancelAppointment,
  checkInAppointment,
  completeAppointment,
  createAppointment,
  deleteAppointment,
  getDoctorAvailability,
  getAllAppointments,
  getAppointmentById,
  markAppointmentNoShow,
  rescheduleAppointment,
  startAppointment,
} from "../controllers/appointmentController.js";

const router = express.Router();

router.get("/", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), getAllAppointments);
router.get("/doctor/:doctorId/availability", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), getDoctorAvailability);
router.get("/:id", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), getAppointmentById);
router.post("/", authenticate, authorize(["RECEPTIONIST", "PATIENT"]), createAppointment);
router.post("/:id/cancel", authenticate, authorize(["RECEPTIONIST", "PATIENT"]), cancelAppointment);
router.post("/:id/no-show", authenticate, authorize(["RECEPTIONIST", "DOCTOR"]), markAppointmentNoShow);
router.post("/:id/check-in", authenticate, authorize(["RECEPTIONIST"]), checkInAppointment);
router.post("/:id/reschedule", authenticate, authorize(["RECEPTIONIST"]), rescheduleAppointment);
router.post("/:id/start", authenticate, authorize(["DOCTOR"]), startAppointment);
router.post("/:id/completed", authenticate, authorize(["DOCTOR"]), completeAppointment);
router.delete("/:id", authenticate, authorize(["RECEPTIONIST"]), deleteAppointment);

export default router;
