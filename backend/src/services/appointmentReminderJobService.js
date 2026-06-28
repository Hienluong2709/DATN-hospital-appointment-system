import db from "../models/index.js";
import { dispatchAppointmentReminderEventsForDateService } from "./notificationService.js";

const { JobExecutionLog, sequelize } = db;

const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";
const APPOINTMENT_REMINDER_JOB_INTERVAL_MS =
  Number(process.env.APPOINTMENT_REMINDER_JOB_INTERVAL_MS) || 60 * 1000;
const APPOINTMENT_REMINDER_JOB_ENABLED =
  process.env.APPOINTMENT_REMINDER_JOB_ENABLED !== "false";
const APPOINTMENT_REMINDER_JOB_NAME = "appointment-reminder-dispatch";
const APPOINTMENT_REMINDER_JOB_LOCK_NAME = `${APPOINTMENT_REMINDER_JOB_NAME}-lock`;

let appointmentReminderJobTimer = null;
let isAppointmentReminderJobRunning = false;

const parseUtcOffsetToMinutes = (offsetValue) => {
  const matched = /^([+-])(\d{2}):(\d{2})$/.exec(offsetValue);
  if (!matched) {
    throw new Error("BUSINESS_TIMEZONE_OFFSET không hợp lệ, định dạng yêu cầu +/-HH:mm");
  }

  const sign = matched[1] === "+" ? 1 : -1;
  const hours = Number(matched[2]);
  const minutes = Number(matched[3]);
  return sign * (hours * 60 + minutes);
};

const BUSINESS_TIMEZONE_OFFSET_MINUTES = parseUtcOffsetToMinutes(BUSINESS_TIMEZONE_OFFSET);

const getBusinessShiftedDate = (dateValue = new Date()) =>
  new Date(dateValue.getTime() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);

const getBusinessDateString = (dateValue = new Date()) => {
  const shifted = getBusinessShiftedDate(dateValue);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const scheduleNextAppointmentReminderJobRun = () => {
  if (!APPOINTMENT_REMINDER_JOB_ENABLED) {
    console.info("[appointment reminder scheduler] disabled");
    return;
  }

  if (appointmentReminderJobTimer) {
    clearTimeout(appointmentReminderJobTimer);
  }

  appointmentReminderJobTimer = setTimeout(async () => {
    try {
      await runAppointmentReminderJob({
        triggerType: "scheduler",
      });
    } catch (error) {
      console.error("[appointment reminder scheduler] failed:", error.message);
    } finally {
      scheduleNextAppointmentReminderJobRun();
    }
  }, APPOINTMENT_REMINDER_JOB_INTERVAL_MS);

  console.info(
    `[appointment reminder scheduler] next run in ${APPOINTMENT_REMINDER_JOB_INTERVAL_MS}ms`,
  );
};

const acquireAppointmentReminderJobLock = async () => {
  const [rows] = await sequelize.query(
    "SELECT GET_LOCK(:lockName, 0) AS acquired",
    {
      replacements: { lockName: APPOINTMENT_REMINDER_JOB_LOCK_NAME },
    },
  );

  return rows?.[0]?.acquired === 1;
};

const releaseAppointmentReminderJobLock = async () => {
  await sequelize.query("SELECT RELEASE_LOCK(:lockName)", {
    replacements: { lockName: APPOINTMENT_REMINDER_JOB_LOCK_NAME },
  });
};

export const runAppointmentReminderJob = async ({
  date,
  dryRun = false,
  triggerType = "scheduler",
} = {}) => {
  if (!APPOINTMENT_REMINDER_JOB_ENABLED && triggerType === "scheduler") {
    return {
      date: date || getBusinessDateString(),
      dry_run: Boolean(dryRun),
      skipped_reason: "job_disabled",
    };
  }

  if (isAppointmentReminderJobRunning) {
    return {
      date: date || getBusinessDateString(),
      dry_run: Boolean(dryRun),
      skipped_reason: "already_running_in_process",
    };
  }

  isAppointmentReminderJobRunning = true;
  const targetDate = date || getBusinessDateString();

  const lockAcquired = await acquireAppointmentReminderJobLock();
  if (!lockAcquired) {
    isAppointmentReminderJobRunning = false;
    return {
      date: targetDate,
      dry_run: Boolean(dryRun),
      skipped_reason: "lock_not_acquired",
    };
  }

  const jobLog = await JobExecutionLog.create({
    job_name: APPOINTMENT_REMINDER_JOB_NAME,
    target_date: targetDate,
    trigger_type: triggerType,
    dry_run: Boolean(dryRun),
    status: "Running",
    started_at: new Date(),
  });

  try {
    const summary = await dispatchAppointmentReminderEventsForDateService(targetDate, {
      dryRun,
    });

    await jobLog.update({
      status: "Succeeded",
      finished_at: new Date(),
      summary_json: summary,
      error_message: null,
    });

    console.info(
      `[appointment reminder scheduler] completed date=${summary.date} reminders=${summary.reminder_created}`,
    );

    return summary;
  } catch (error) {
    await jobLog.update({
      status: "Failed",
      finished_at: new Date(),
      error_message: error.message,
    });

    console.error("[appointment reminder scheduler] failed:", error.message);
    throw error;
  } finally {
    await releaseAppointmentReminderJobLock();
    isAppointmentReminderJobRunning = false;
  }
};

export const startAppointmentReminderJob = () => {
  scheduleNextAppointmentReminderJobRun();
};

export const stopAppointmentReminderJob = () => {
  if (appointmentReminderJobTimer) {
    clearTimeout(appointmentReminderJobTimer);
    appointmentReminderJobTimer = null;
  }
};
