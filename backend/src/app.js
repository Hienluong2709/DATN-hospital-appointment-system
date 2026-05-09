import express from "express";
import dotenv from "dotenv";
import sequelize from "./config/db.js";
import db from "./models/index.js";
import initAssociations from "./models/associations.js";
import authRoutes from "./routes/authRoutes.js";
import specialtyRoutes from "./routes/specialtyRoutes.js";
import roomRoutes from "./routes/roomRoutes.js";
import doctorRoutes from "./routes/doctorRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import workScheduleRoutes from "./routes/workScheduleRoutes.js";
import workScheduleBlockRoutes from "./routes/workScheduleBlockRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import queueRoutes from "./routes/queueRoutes.js";
import equeueNumberRoutes from "./routes/equeueNumberRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import { cleanupExpiredPendingAppointmentsService } from "./services/appointmentService.js";
import { startInProgressQueueReforecastJob } from "./services/inProgressQueueReforecastJobService.js";
import { startNoShowEndOfDayJob } from "./services/noShowJobService.js";
import { startQueueNotificationDispatchJob } from "./services/queueNotificationJobService.js";

dotenv.config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 5000;
const PENDING_APPOINTMENT_CLEANUP_INTERVAL_MS =
  Number(process.env.PENDING_APPOINTMENT_CLEANUP_INTERVAL_MS) || 60 * 1000;

// Ensure all model relationships are registered before sync/query operations.
initAssociations(db);

let pendingCleanupTimer;

const startPendingAppointmentCleanupJob = () => {
  if (pendingCleanupTimer) {
    clearInterval(pendingCleanupTimer);
  }

  pendingCleanupTimer = setInterval(async () => {
    try {
      const affectedRows = await cleanupExpiredPendingAppointmentsService();
      if (affectedRows > 0) {
        console.log(`Auto-cancelled ${affectedRows} expired pending appointment(s)`);
      }
    } catch (error) {
      console.error("Pending appointment cleanup job failed:", error.message);
    }
  }, PENDING_APPOINTMENT_CLEANUP_INTERVAL_MS);
};

const startServer = async () => {
  try {
    // 1. Test DB connection
    await sequelize.authenticate();
    console.log("MySQL connected successfully!");

    // 2. Start server (schema should be managed by migrations)
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });

    startPendingAppointmentCleanupJob();
    startInProgressQueueReforecastJob();
    startNoShowEndOfDayJob();
    startQueueNotificationDispatchJob();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1); // dừng app nếu lỗi DB
  }
};

app.get("/", (req, res) => {
  res.json({
    message: "Backend is running",
    status: "OK",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/specialties", specialtyRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/users", userRoutes);
app.use("/api/work-schedules", workScheduleRoutes);
app.use("/api/work-schedule-blocks", workScheduleBlockRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/queues", queueRoutes);
app.use("/api/equeue-numbers", equeueNumberRoutes);
app.use("/api/dashboard", dashboardRoutes);

startServer();
