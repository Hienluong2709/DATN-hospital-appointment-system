import db from "../models/index.js";
import { dispatchQueueNotificationEventsForDateService } from "./notificationService.js";

const { JobExecutionLog, sequelize } = db;

const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";
const QUEUE_NOTIFICATION_JOB_INTERVAL_MS =
  Number(process.env.QUEUE_NOTIFICATION_JOB_INTERVAL_MS) || 60 * 1000;
const QUEUE_NOTIFICATION_JOB_ENABLED =
  process.env.QUEUE_NOTIFICATION_JOB_ENABLED !== "false";
const QUEUE_NOTIFICATION_JOB_NAME = "queue-notification-dispatch";
const QUEUE_NOTIFICATION_JOB_LOCK_NAME = `${QUEUE_NOTIFICATION_JOB_NAME}-lock`;

let queueNotificationJobTimer = null;
let isQueueNotificationJobRunning = false;

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

const scheduleNextQueueNotificationJobRun = () => {
  if (!QUEUE_NOTIFICATION_JOB_ENABLED) {
    console.info("[queue notification scheduler] disabled");
    return;
  }

  if (queueNotificationJobTimer) {
    clearTimeout(queueNotificationJobTimer);
  }

  queueNotificationJobTimer = setTimeout(async () => {
    try {
      await runQueueNotificationJob({
        triggerType: "scheduler",
      });
    } catch (error) {
      console.error("[queue notification scheduler] failed:", error.message);
    } finally {
      scheduleNextQueueNotificationJobRun();
    }
  }, QUEUE_NOTIFICATION_JOB_INTERVAL_MS);

  console.info(
    `[queue notification scheduler] next run in ${QUEUE_NOTIFICATION_JOB_INTERVAL_MS}ms`
  );
};

const acquireQueueNotificationJobLock = async () => {
  const [rows] = await sequelize.query(
    "SELECT GET_LOCK(:lockName, 0) AS acquired",
    {
      replacements: { lockName: QUEUE_NOTIFICATION_JOB_LOCK_NAME },
    }
  );

  return rows?.[0]?.acquired === 1;
};

const releaseQueueNotificationJobLock = async () => {
  await sequelize.query("SELECT RELEASE_LOCK(:lockName)", {
    replacements: { lockName: QUEUE_NOTIFICATION_JOB_LOCK_NAME },
  });
};

export const runQueueNotificationJob = async ({
  date,
  dryRun = false,
  triggerType = "scheduler",
} = {}) => {
  if (!QUEUE_NOTIFICATION_JOB_ENABLED && triggerType === "scheduler") {
    return {
      date: date || getBusinessDateString(),
      dry_run: Boolean(dryRun),
      skipped_reason: "job_disabled",
    };
  }

  if (isQueueNotificationJobRunning) {
    return {
      date: date || getBusinessDateString(),
      dry_run: Boolean(dryRun),
      skipped_reason: "already_running_in_process",
    };
  }

  isQueueNotificationJobRunning = true;
  const targetDate = date || getBusinessDateString();

  const lockAcquired = await acquireQueueNotificationJobLock();
  if (!lockAcquired) {
    isQueueNotificationJobRunning = false;
    return {
      date: targetDate,
      dry_run: Boolean(dryRun),
      skipped_reason: "lock_not_acquired",
    };
  }

  const jobLog = await JobExecutionLog.create({
    job_name: QUEUE_NOTIFICATION_JOB_NAME,
    target_date: targetDate,
    trigger_type: triggerType,
    dry_run: Boolean(dryRun),
    status: "Running",
    started_at: new Date(),
  });

  try {
    const summary = await dispatchQueueNotificationEventsForDateService(targetDate, {
      dryRun,
    });

    await jobLog.update({
      status: "Succeeded",
      finished_at: new Date(),
      summary_json: summary,
      error_message: null,
    });

    console.info(
      `[queue notification scheduler] completed date=${summary.date} ready=${summary.queue_ready_created} soon=${summary.queue_soon_created}`
    );

    return summary;
  } catch (error) {
    await jobLog.update({
      status: "Failed",
      finished_at: new Date(),
      error_message: error.message,
    });

    console.error("[queue notification scheduler] failed:", error.message);
    throw error;
  } finally {
    await releaseQueueNotificationJobLock();
    isQueueNotificationJobRunning = false;
  }
};

export const startQueueNotificationDispatchJob = () => {
  scheduleNextQueueNotificationJobRun();
};

export const stopQueueNotificationDispatchJob = () => {
  if (queueNotificationJobTimer) {
    clearTimeout(queueNotificationJobTimer);
    queueNotificationJobTimer = null;
  }
};
