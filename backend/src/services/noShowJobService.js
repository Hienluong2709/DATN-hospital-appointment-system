import db from "../models/index.js";
import { markAppointmentsAsNoShowForDateService } from "./appointmentService.js";

const { JobExecutionLog, sequelize } = db;

const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";
const NO_SHOW_JOB_HOUR = Number(process.env.NO_SHOW_JOB_HOUR) || 23;
const NO_SHOW_JOB_MINUTE = Number(process.env.NO_SHOW_JOB_MINUTE) || 55;
const NO_SHOW_JOB_ENABLED = process.env.NO_SHOW_JOB_ENABLED !== "false";
const NO_SHOW_JOB_NAME = "appointments-mark-no-show";
const NO_SHOW_JOB_LOCK_NAME = `${NO_SHOW_JOB_NAME}-lock`;

let noShowJobTimer = null;
let isNoShowJobRunning = false;

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

const getUtcDateForBusinessWallClock = (dateString, hour, minute) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const utcTimestamp =
    Date.UTC(year, month - 1, day, hour, minute, 0, 0) -
    BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000;

  return new Date(utcTimestamp);
};

const getNextNoShowJobRunAt = (now = new Date()) => {
  const currentBusinessDate = getBusinessDateString(now);
  let nextRun = getUtcDateForBusinessWallClock(currentBusinessDate, NO_SHOW_JOB_HOUR, NO_SHOW_JOB_MINUTE);

  if (nextRun.getTime() <= now.getTime()) {
    const shifted = getBusinessShiftedDate(now);
    shifted.setUTCDate(shifted.getUTCDate() + 1);
    const nextDateString = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(
      shifted.getUTCDate()
    ).padStart(2, "0")}`;
    nextRun = getUtcDateForBusinessWallClock(nextDateString, NO_SHOW_JOB_HOUR, NO_SHOW_JOB_MINUTE);
  }

  return nextRun;
};

const scheduleNextNoShowJobRun = () => {
  if (!NO_SHOW_JOB_ENABLED) {
    console.info("[no-show scheduler] disabled by NO_SHOW_JOB_ENABLED=false");
    return;
  }

  if (noShowJobTimer) {
    clearTimeout(noShowJobTimer);
  }

  const nextRun = getNextNoShowJobRunAt();
  const delayMs = Math.max(nextRun.getTime() - Date.now(), 1000);

  console.info(
    `[no-show scheduler] next run at ${nextRun.toISOString()} (business ${NO_SHOW_JOB_HOUR
      .toString()
      .padStart(2, "0")}:${NO_SHOW_JOB_MINUTE.toString().padStart(2, "0")} ${BUSINESS_TIMEZONE_OFFSET})`
  );

  noShowJobTimer = setTimeout(async () => {
    try {
      const summary = await runNoShowJob({
        triggerType: "scheduler",
      });
      if (summary?.skipped_reason === "lock_not_acquired") {
        console.info("[no-show scheduler] skipped because another instance is holding the DB lock");
      }
    } finally {
      scheduleNextNoShowJobRun();
    }
  }, delayMs);
};

const acquireNoShowJobLock = async () => {
  const [rows] = await sequelize.query("SELECT GET_LOCK(?, 0) AS acquired", {
    replacements: [NO_SHOW_JOB_LOCK_NAME],
  });

  return rows?.[0]?.acquired === 1;
};

const releaseNoShowJobLock = async () => {
  try {
    await sequelize.query("SELECT RELEASE_LOCK(?) AS released", {
      replacements: [NO_SHOW_JOB_LOCK_NAME],
    });
  } catch (error) {
    console.error("[no-show scheduler] failed to release DB lock:", error.message);
  }
};

export const runNoShowJob = async ({ date, dryRun = false, triggerType = "manual" } = {}) => {
  if (isNoShowJobRunning) {
    const error = new Error("Tiến trình ghi nhận vắng mặt đang chạy, vui lòng thử lại sau");
    error.statusCode = 409;
    throw error;
  }

  isNoShowJobRunning = true;
  const targetDate = date || getBusinessDateString();
  const lockAcquired = await acquireNoShowJobLock();

  if (!lockAcquired) {
    isNoShowJobRunning = false;
    return {
      date: targetDate,
      dry_run: Boolean(dryRun),
      skipped_reason: "lock_not_acquired",
    };
  }

  const jobLog = await JobExecutionLog.create({
    job_name: NO_SHOW_JOB_NAME,
    target_date: targetDate,
    trigger_type: triggerType,
    dry_run: Boolean(dryRun),
    status: "Running",
    started_at: new Date(),
  });

  try {
    const summary = await markAppointmentsAsNoShowForDateService(targetDate, { dryRun });

    await jobLog.update({
      status: "Succeeded",
      finished_at: new Date(),
      summary_json: summary,
      error_message: null,
    });

    console.info(
      `[no-show scheduler] completed date=${summary.date} dry_run=${summary.dry_run} marked=${summary.marked_no_show} queues_removed=${summary.queues_removed}`
    );

    return summary;
  } catch (error) {
    await jobLog.update({
      status: "Failed",
      finished_at: new Date(),
      error_message: error.message,
    });

    console.error("[no-show scheduler] failed:", error.message);
    throw error;
  } finally {
    await releaseNoShowJobLock();
    isNoShowJobRunning = false;
  }
};

export const startNoShowEndOfDayJob = () => {
  scheduleNextNoShowJobRun();
};

export const stopNoShowEndOfDayJob = () => {
  if (noShowJobTimer) {
    clearTimeout(noShowJobTimer);
    noShowJobTimer = null;
  }
};
