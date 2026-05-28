import { Op } from "sequelize";

import db from "../models/index.js";
import {
  getAverageVisitDurationMinutesService,
  recalculateQueueForecastForDoctorDateService,
} from "./queueForecastService.js";
import { publishQueueForecastRealtimeEvent } from "./realtimeService.js";

const { JobExecutionLog, Queue, sequelize } = db;

const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";
const IN_PROGRESS_QUEUE_REFORECAST_JOB_INTERVAL_MS =
  Number(process.env.IN_PROGRESS_QUEUE_REFORECAST_JOB_INTERVAL_MS) || 60 * 1000;
const IN_PROGRESS_QUEUE_REFORECAST_JOB_ENABLED =
  process.env.IN_PROGRESS_QUEUE_REFORECAST_JOB_ENABLED !== "false";
const IN_PROGRESS_QUEUE_REFORECAST_JOB_NAME = "in-progress-queue-reforecast";
const IN_PROGRESS_QUEUE_REFORECAST_JOB_LOCK_NAME =
  `${IN_PROGRESS_QUEUE_REFORECAST_JOB_NAME}-lock`;

let inProgressQueueReforecastJobTimer = null;
let isInProgressQueueReforecastJobRunning = false;

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

const scheduleNextInProgressQueueReforecastJobRun = () => {
  if (!IN_PROGRESS_QUEUE_REFORECAST_JOB_ENABLED) {
    console.info("[in-progress reforecast scheduler] disabled");
    return;
  }

  if (inProgressQueueReforecastJobTimer) {
    clearTimeout(inProgressQueueReforecastJobTimer);
  }

  inProgressQueueReforecastJobTimer = setTimeout(async () => {
    try {
      await runInProgressQueueReforecastJob({
        triggerType: "scheduler",
      });
    } catch (error) {
      console.error("[in-progress reforecast scheduler] failed:", error.message);
    } finally {
      scheduleNextInProgressQueueReforecastJobRun();
    }
  }, IN_PROGRESS_QUEUE_REFORECAST_JOB_INTERVAL_MS);

  console.info(
    `[in-progress reforecast scheduler] next run in ${IN_PROGRESS_QUEUE_REFORECAST_JOB_INTERVAL_MS}ms`
  );
};

const acquireInProgressQueueReforecastJobLock = async () => {
  const [rows] = await sequelize.query(
    "SELECT GET_LOCK(:lockName, 0) AS acquired",
    {
      replacements: { lockName: IN_PROGRESS_QUEUE_REFORECAST_JOB_LOCK_NAME },
    },
  );

  return rows?.[0]?.acquired === 1;
};

const releaseInProgressQueueReforecastJobLock = async () => {
  await sequelize.query("SELECT RELEASE_LOCK(:lockName)", {
    replacements: { lockName: IN_PROGRESS_QUEUE_REFORECAST_JOB_LOCK_NAME },
  });
};

const buildQueueThresholdDate = (queue, averageVisitDurationMinutes) => {
  const baseValue = queue?.estimated_start || queue?.actual_start || null;
  const baseDate = baseValue ? new Date(baseValue) : null;

  if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) {
    return null;
  }

  return new Date(baseDate.getTime() + averageVisitDurationMinutes * 60 * 1000);
};

const detectOverdueInProgressQueueTargets = async ({
  date,
  now = new Date(),
} = {}) => {
  const targetDate = date || getBusinessDateString(now);
  const queues = await Queue.findAll({
    where: {
      date: targetDate,
      actual_start: { [Op.ne]: null },
      actual_end: null,
    },
    attributes: [
      "id",
      "doctor_id",
      "date",
      "queue_number",
      "actual_start",
      "estimated_start",
    ],
    order: [
      ["doctor_id", "ASC"],
      ["queue_number", "ASC"],
      ["id", "ASC"],
    ],
  });

  const averageDurationByDoctorId = new Map();
  const overdueQueueIds = [];
  const recalcTargets = new Map();

  for (const queue of queues) {
    let averageVisitDurationMinutes = averageDurationByDoctorId.get(queue.doctor_id);
    if (averageVisitDurationMinutes === undefined) {
      averageVisitDurationMinutes = await getAverageVisitDurationMinutesService(queue.doctor_id);
      averageDurationByDoctorId.set(queue.doctor_id, averageVisitDurationMinutes);
    }

    const thresholdDate = buildQueueThresholdDate(queue, averageVisitDurationMinutes);
    if (!thresholdDate || now.getTime() <= thresholdDate.getTime()) {
      continue;
    }

    overdueQueueIds.push(queue.id);
    recalcTargets.set(`${queue.doctor_id}:${queue.date}`, {
      doctor_id: queue.doctor_id,
      date: queue.date,
    });
  }

  return {
    date: targetDate,
    in_progress_queues_scanned: queues.length,
    overdue_queue_ids: overdueQueueIds,
    recalc_targets: Array.from(recalcTargets.values()),
  };
};

export const runInProgressQueueReforecastJob = async ({
  date,
  dryRun = false,
  triggerType = "scheduler",
} = {}) => {
  if (!IN_PROGRESS_QUEUE_REFORECAST_JOB_ENABLED && triggerType === "scheduler") {
    return {
      date: date || getBusinessDateString(),
      dry_run: Boolean(dryRun),
      skipped_reason: "job_disabled",
    };
  }

  if (isInProgressQueueReforecastJobRunning) {
    return {
      date: date || getBusinessDateString(),
      dry_run: Boolean(dryRun),
      skipped_reason: "already_running_in_process",
    };
  }

  isInProgressQueueReforecastJobRunning = true;
  const targetDate = date || getBusinessDateString();

  const lockAcquired = await acquireInProgressQueueReforecastJobLock();
  if (!lockAcquired) {
    isInProgressQueueReforecastJobRunning = false;
    return {
      date: targetDate,
      dry_run: Boolean(dryRun),
      skipped_reason: "lock_not_acquired",
    };
  }

  const jobLog = await JobExecutionLog.create({
    job_name: IN_PROGRESS_QUEUE_REFORECAST_JOB_NAME,
    target_date: targetDate,
    trigger_type: triggerType,
    dry_run: Boolean(dryRun),
    status: "Running",
    started_at: new Date(),
  });

  try {
    const detectionSummary = await detectOverdueInProgressQueueTargets({
      date: targetDate,
    });

    const summary = {
      ...detectionSummary,
      dry_run: Boolean(dryRun),
      recalculated_target_count: 0,
    };

    if (!dryRun) {
      for (const target of detectionSummary.recalc_targets) {
        await recalculateQueueForecastForDoctorDateService(target.doctor_id, target.date);
        await publishQueueForecastRealtimeEvent({
          reason: "IN_PROGRESS_REFORECAST",
          doctor_id: target.doctor_id,
          date: target.date,
        });
        summary.recalculated_target_count += 1;
      }
    }

    await jobLog.update({
      status: "Succeeded",
      finished_at: new Date(),
      summary_json: summary,
      error_message: null,
    });

    console.info(
      `[in-progress reforecast scheduler] completed date=${summary.date} overdue=${summary.overdue_queue_ids.length} recalculated=${summary.recalculated_target_count}`
    );

    return summary;
  } catch (error) {
    await jobLog.update({
      status: "Failed",
      finished_at: new Date(),
      error_message: error.message,
    });

    console.error("[in-progress reforecast scheduler] failed:", error.message);
    throw error;
  } finally {
    await releaseInProgressQueueReforecastJobLock();
    isInProgressQueueReforecastJobRunning = false;
  }
};

export const startInProgressQueueReforecastJob = () => {
  scheduleNextInProgressQueueReforecastJobRun();
};

export const stopInProgressQueueReforecastJob = () => {
  if (inProgressQueueReforecastJobTimer) {
    clearTimeout(inProgressQueueReforecastJobTimer);
    inProgressQueueReforecastJobTimer = null;
  }
};
