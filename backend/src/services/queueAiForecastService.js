import fs from "fs";
import path from "path";
import { spawn } from "child_process";

import db from "../models/index.js";

const { Doctor } = db;

const BACKEND_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const AI_ENGINE_ROOT = path.resolve(
  BACKEND_ROOT,
  process.env.QUEUE_AI_ENGINE_ROOT || "../ai-engine",
);

const DEFAULT_CATBOOST_MODEL_PATH = path.resolve(
  AI_ENGINE_ROOT,
  "artifacts/latest/models/catboost-regressor.cbm",
);
const DEFAULT_CATBOOST_PYTHON_BIN = path.resolve(AI_ENGINE_ROOT, ".venv/bin/python");

const QUEUE_AI_FORECAST_ENABLED = process.env.QUEUE_AI_FORECAST_ENABLED !== "false";
const QUEUE_AI_FORECAST_PROVIDER =
  process.env.QUEUE_AI_FORECAST_PROVIDER || "local_heuristic";
const QUEUE_AI_MODEL_VERSION = process.env.QUEUE_AI_MODEL_VERSION || null;
const QUEUE_AI_COMPARE_WITH_HEURISTIC =
  process.env.QUEUE_AI_COMPARE_WITH_HEURISTIC === "true";
const QUEUE_AI_MAX_WAIT_MINUTES =
  Number(process.env.QUEUE_AI_MAX_WAIT_MINUTES) || 8 * 60;

const resolveRepoRelativePath = (rawPath, fallbackPath) =>
  rawPath ? path.resolve(BACKEND_ROOT, rawPath) : fallbackPath;

const QUEUE_AI_CATBOOST_MODEL_PATH = resolveRepoRelativePath(
  process.env.QUEUE_AI_CATBOOST_MODEL_PATH,
  DEFAULT_CATBOOST_MODEL_PATH,
);
const QUEUE_AI_CATBOOST_PYTHON_BIN = resolveRepoRelativePath(
  process.env.QUEUE_AI_CATBOOST_PYTHON_BIN,
  DEFAULT_CATBOOST_PYTHON_BIN,
);

const parseDateTime = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const diffMinutes = (start, end) => {
  const left = parseDateTime(start);
  const right = parseDateTime(end);

  if (!left || !right) {
    return null;
  }

  return Math.round((right.getTime() - left.getTime()) / 60000);
};

const average = (values) => {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const clampWaitMinutes = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(QUEUE_AI_MAX_WAIT_MINUTES, Math.round(value)));
};

const getDateParts = (dateValue) => {
  if (!dateValue) {
    return null;
  }

  const parsed = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return {
    weekday: parsed.getUTCDay(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  };
};

const parseUtcOffsetToMinutes = (offsetValue) => {
  const matched = /^([+-])(\d{2}):(\d{2})$/.exec(offsetValue || "");
  if (!matched) {
    throw new Error("BUSINESS_TIMEZONE_OFFSET không hợp lệ");
  }

  const sign = matched[1] === "+" ? 1 : -1;
  return sign * (Number(matched[2]) * 60 + Number(matched[3]));
};

const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";
const BUSINESS_TIMEZONE_OFFSET_MINUTES = parseUtcOffsetToMinutes(BUSINESS_TIMEZONE_OFFSET);

const getMinuteOfDay = (value) => {
  const parsed = parseDateTime(value);
  if (!parsed) {
    return null;
  }

  const shifted = new Date(parsed.getTime() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
};

const getPriorityLevel = (queueLike) =>
  queueLike?.Appointment?.priority_level || queueLike?.priority_level || "Normal";

const getPriorityRank = (priorityLevel) => {
  if (priorityLevel === "Emergency") {
    return 0;
  }

  if (priorityLevel === "Priority") {
    return 1;
  }

  return 2;
};

const buildQueueNumberOrderItems = (queueLikeItems = []) =>
  [...queueLikeItems].sort((left, right) => {
    const priorityDiff = getPriorityRank(getPriorityLevel(left)) - getPriorityRank(getPriorityLevel(right));
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const leftQueueNumber = Number.isInteger(left?.queue_number)
      ? left.queue_number
      : Number.MAX_SAFE_INTEGER;
    const rightQueueNumber = Number.isInteger(right?.queue_number)
      ? right.queue_number
      : Number.MAX_SAFE_INTEGER;

    if (leftQueueNumber !== rightQueueNumber) {
      return leftQueueNumber - rightQueueNumber;
    }

    return (left?.id ?? Number.MAX_SAFE_INTEGER) - (right?.id ?? Number.MAX_SAFE_INTEGER);
  });

const buildCatboostFeatureRow = ({
  aiContext,
  queueLikeItems,
  queueLike,
  checkedInAt,
  originalScheduledTime,
  latestPredictedStart,
  ruleBasedWaitMinutes,
} = {}) => {
  const queuesInTrainingOrder = buildQueueNumberOrderItems(queueLikeItems);
  const currentIndex = queuesInTrainingOrder.findIndex((item) => item?.id === queueLike?.id);
  const priorRows = currentIndex <= 0 ? [] : queuesInTrainingOrder.slice(0, currentIndex);

  const checkedInAheadRows = priorRows.filter((candidate) => {
    const candidateCheckIn = parseDateTime(candidate?.checked_in_at);
    return candidateCheckIn && candidateCheckIn <= checkedInAt;
  });
  const completedAheadRows = priorRows.filter((candidate) => {
    const actualEnd = parseDateTime(candidate?.actual_end);
    return actualEnd && actualEnd <= checkedInAt;
  });
  const inProgressAheadRows = priorRows.filter((candidate) => {
    const actualStart = parseDateTime(candidate?.actual_start);
    const actualEnd = parseDateTime(candidate?.actual_end);

    return actualStart && actualStart <= checkedInAt && (!actualEnd || actualEnd > checkedInAt);
  });
  const completedAheadDurations = completedAheadRows
    .map((candidate) => diffMinutes(candidate?.actual_start, candidate?.actual_end))
    .filter((value) => Number.isFinite(value) && value > 0);
  const latestCompletedAhead = completedAheadRows
    .map((candidate) => parseDateTime(candidate?.actual_end))
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const dateParts = getDateParts(queueLike?.date);

  return {
    doctor_id: queueLike?.doctor_id ?? null,
    specialty_id: aiContext?.doctor_profile?.specialty_id ?? null,
    room_id: aiContext?.doctor_profile?.room_id ?? null,
    queue_number: queueLike?.queue_number ?? null,
    priority_level: getPriorityLevel(queueLike),
    doctor_daily_queue_count: queuesInTrainingOrder.length,
    queues_ahead_total_count: priorRows.length,
    queues_ahead_checked_in_count: checkedInAheadRows.length,
    queues_ahead_completed_by_checkin_count: completedAheadRows.length,
    queues_ahead_active_backlog_count:
      checkedInAheadRows.length - completedAheadRows.length,
    queues_ahead_not_checked_in_count: priorRows.length - checkedInAheadRows.length,
    queues_ahead_in_progress_count: inProgressAheadRows.length,
    completed_ahead_avg_visit_minutes: average(completedAheadDurations),
    completed_ahead_total_visit_minutes: completedAheadDurations.length
      ? completedAheadDurations.reduce((sum, value) => sum + value, 0)
      : null,
    minutes_since_last_completed_ahead: latestCompletedAhead
      ? diffMinutes(latestCompletedAhead, checkedInAt)
      : null,
    appointment_weekday: dateParts?.weekday ?? null,
    appointment_month: dateParts?.month ?? null,
    appointment_day: dateParts?.day ?? null,
    checked_in_minute_of_day: getMinuteOfDay(checkedInAt),
    original_estimated_start_minute_of_day: getMinuteOfDay(originalScheduledTime),
    latest_predicted_start_minute_of_day: getMinuteOfDay(latestPredictedStart),
    checkin_offset_from_original_estimated_start_minutes: diffMinutes(
      checkedInAt,
      originalScheduledTime,
    ),
    checkin_offset_from_latest_predicted_start_minutes: diffMinutes(
      checkedInAt,
      latestPredictedStart,
    ),
    baseline_predicted_wait_minutes: ruleBasedWaitMinutes ?? null,
  };
};

const runCatboostInference = ({ featureRow }) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      QUEUE_AI_CATBOOST_PYTHON_BIN,
      ["-m", "ai_engine.predict"],
      {
        cwd: AI_ENGINE_ROOT,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ai_engine.predict exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Invalid ai_engine.predict output: ${error.message}`));
      }
    });

    child.stdin.write(
      JSON.stringify({
        model_path: QUEUE_AI_CATBOOST_MODEL_PATH,
        feature_row: featureRow,
      }),
    );
    child.stdin.end();
  });

export const createQueueAiForecastContextService = async ({
  doctorId,
  transaction,
} = {}) => {
  const doctorProfile = doctorId
    ? await Doctor.findByPk(doctorId, {
        attributes: ["id", "specialty_id", "room_id"],
        transaction,
      })
    : null;

  return {
    provider: QUEUE_AI_FORECAST_PROVIDER,
    doctor_profile: doctorProfile
      ? {
          id: doctorProfile.id,
          specialty_id: doctorProfile.specialty_id ?? null,
          room_id: doctorProfile.room_id ?? null,
        }
      : null,
  };
};

export const predictCheckedInQueueWaitMinutesService = async ({
  aiContext,
  queueLikeItems,
  queueLike,
  checkedInAt,
  originalScheduledTime,
  latestPredictedStart,
  ruleBasedWaitMinutes,
} = {}) => {
  if (!QUEUE_AI_FORECAST_ENABLED) {
    return {
      available: false,
      provider: QUEUE_AI_FORECAST_PROVIDER,
      model_version: QUEUE_AI_MODEL_VERSION || "ai_disabled",
    };
  }

  if (QUEUE_AI_FORECAST_PROVIDER !== "catboost_local") {
    return {
      available: false,
      provider: QUEUE_AI_FORECAST_PROVIDER,
      model_version: QUEUE_AI_MODEL_VERSION || QUEUE_AI_FORECAST_PROVIDER,
    };
  }

  if (!(checkedInAt instanceof Date) || Number.isNaN(checkedInAt.getTime())) {
    return {
      available: false,
      provider: QUEUE_AI_FORECAST_PROVIDER,
      model_version: QUEUE_AI_MODEL_VERSION || "catboost_missing_checkin",
    };
  }

  if (!fs.existsSync(QUEUE_AI_CATBOOST_PYTHON_BIN)) {
    return {
      available: false,
      provider: QUEUE_AI_FORECAST_PROVIDER,
      model_version: QUEUE_AI_MODEL_VERSION || "catboost_python_missing",
    };
  }

  if (!fs.existsSync(QUEUE_AI_CATBOOST_MODEL_PATH)) {
    return {
      available: false,
      provider: QUEUE_AI_FORECAST_PROVIDER,
      model_version: QUEUE_AI_MODEL_VERSION || "catboost_model_missing",
    };
  }

  const featureRow = buildCatboostFeatureRow({
    aiContext,
    queueLikeItems,
    queueLike,
    checkedInAt,
    originalScheduledTime,
    latestPredictedStart,
    ruleBasedWaitMinutes,
  });

  const inferenceResult = await runCatboostInference({ featureRow });
  const predictedWaitMinutes = clampWaitMinutes(inferenceResult?.predicted_wait_minutes);
  const comparison = QUEUE_AI_COMPARE_WITH_HEURISTIC
    ? {
        heuristic_predicted_wait_minutes: ruleBasedWaitMinutes ?? null,
        delta_minutes:
          typeof ruleBasedWaitMinutes === "number"
            ? predictedWaitMinutes - ruleBasedWaitMinutes
            : null,
      }
    : null;

  return {
    available: true,
    predicted_wait_minutes: predictedWaitMinutes,
    prediction_source: "ai_catboost_local",
    provider: QUEUE_AI_FORECAST_PROVIDER,
    model_version:
      QUEUE_AI_MODEL_VERSION || path.basename(QUEUE_AI_CATBOOST_MODEL_PATH, ".cbm"),
    feature_row: featureRow,
    comparison,
  };
};
