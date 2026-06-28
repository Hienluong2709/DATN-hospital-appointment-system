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
const DEFAULT_AI_ARTIFACT_MANIFEST_PATH = path.resolve(
  AI_ENGINE_ROOT,
  "artifacts/latest/manifest.json",
);
const DEFAULT_AI_ARTIFACT_LEADERBOARD_PATH = path.resolve(
  AI_ENGINE_ROOT,
  "artifacts/latest/leaderboard.json",
);

const QUEUE_AI_FORECAST_ENABLED = process.env.QUEUE_AI_FORECAST_ENABLED !== "false";
const QUEUE_AI_FORECAST_PROVIDER =
  process.env.QUEUE_AI_FORECAST_PROVIDER || "local_heuristic";
const QUEUE_AI_MODEL_VERSION = process.env.QUEUE_AI_MODEL_VERSION || null;
const QUEUE_AI_COMPARE_WITH_HEURISTIC =
  process.env.QUEUE_AI_COMPARE_WITH_HEURISTIC === "true";
const QUEUE_AI_MAX_WAIT_MINUTES =
  Number(process.env.QUEUE_AI_MAX_WAIT_MINUTES) || 8 * 60;
const QUEUE_AI_SERVICE_URL =
  process.env.QUEUE_AI_SERVICE_URL || "http://127.0.0.1:8001";
const QUEUE_AI_SERVICE_TIMEOUT_MS =
  Number(process.env.QUEUE_AI_SERVICE_TIMEOUT_MS) || 2500;

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
const QUEUE_AI_ARTIFACT_MANIFEST_PATH = resolveRepoRelativePath(
  process.env.QUEUE_AI_ARTIFACT_MANIFEST_PATH,
  DEFAULT_AI_ARTIFACT_MANIFEST_PATH,
);
const QUEUE_AI_ARTIFACT_LEADERBOARD_PATH = resolveRepoRelativePath(
  process.env.QUEUE_AI_ARTIFACT_LEADERBOARD_PATH,
  DEFAULT_AI_ARTIFACT_LEADERBOARD_PATH,
);

const readJsonFileIfExists = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

const getCatboostArtifactMetadata = () => {
  const manifest = readJsonFileIfExists(QUEUE_AI_ARTIFACT_MANIFEST_PATH);
  const leaderboard = readJsonFileIfExists(QUEUE_AI_ARTIFACT_LEADERBOARD_PATH);
  const catboostMetrics = Array.isArray(leaderboard)
    ? leaderboard.find((item) => item?.model_name === "catboost_regressor") || null
    : null;
  const rowsTotal = Number(manifest?.rows_total);
  const mae = Number(catboostMetrics?.mae);

  return {
    manifest_path: QUEUE_AI_ARTIFACT_MANIFEST_PATH,
    leaderboard_path: QUEUE_AI_ARTIFACT_LEADERBOARD_PATH,
    rows_total: Number.isFinite(rowsTotal) ? rowsTotal : null,
    rows_train: Number.isFinite(Number(manifest?.rows_train)) ? Number(manifest.rows_train) : null,
    rows_test: Number.isFinite(Number(manifest?.rows_test)) ? Number(manifest.rows_test) : null,
    primary_model: manifest?.primary_model || "catboost_regressor",
    benchmark_mae: Number.isFinite(mae) ? mae : null,
    benchmark_rmse: Number.isFinite(Number(catboostMetrics?.rmse)) ? Number(catboostMetrics.rmse) : null,
    benchmark_r2: Number.isFinite(Number(catboostMetrics?.r2)) ? Number(catboostMetrics.r2) : null,
    tuned: Boolean(catboostMetrics?.tuned || manifest?.catboost_tuned),
  };
};

const buildRuntimeModelVersion = (artifactMetadata) => {
  if (QUEUE_AI_MODEL_VERSION) {
    return QUEUE_AI_MODEL_VERSION;
  }

  if (artifactMetadata?.rows_total && artifactMetadata?.benchmark_mae) {
    return `catboost_rows${artifactMetadata.rows_total}_mae${artifactMetadata.benchmark_mae.toFixed(2)}`;
  }

  return path.basename(QUEUE_AI_CATBOOST_MODEL_PATH, ".cbm");
};

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

const parseDateTimeAtBusinessOffset = (dateValue, timeValue) => {
  if (!dateValue || !timeValue) {
    return null;
  }

  const [year, month, day] = String(dateValue).slice(0, 10).split("-").map(Number);
  const [hour, minute, second] = String(timeValue).slice(0, 8).split(":").map(Number);
  const timestamp =
    Date.UTC(year, month - 1, day, hour, minute, second || 0) -
    BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
  const parsed = new Date(timestamp);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getServicePriorityDate = (queueLike) => {
  const originalEstimatedStart = parseDateTime(queueLike?.original_estimated_start);
  if (originalEstimatedStart) {
    return originalEstimatedStart;
  }

  const appointmentDate = queueLike?.date || queueLike?.Appointment?.date;
  const timeSlot = queueLike?.Appointment?.time_slot;
  const appointmentTimeSlot = parseDateTimeAtBusinessOffset(appointmentDate, timeSlot);
  if (appointmentTimeSlot) {
    return appointmentTimeSlot;
  }

  const estimatedStart = parseDateTime(queueLike?.estimated_start);
  if (estimatedStart) {
    return estimatedStart;
  }

  return parseDateTime(queueLike?.checked_in_at);
};

const getQueueNumberValue = (queueLike) =>
  Number.isInteger(queueLike?.queue_number)
    ? queueLike.queue_number
    : Number.MAX_SAFE_INTEGER;

const buildServiceOrderItems = (queueLikeItems = []) =>
  [...queueLikeItems].sort((left, right) => {
    const priorityDiff = getPriorityRank(getPriorityLevel(left)) - getPriorityRank(getPriorityLevel(right));
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const leftServiceDate = getServicePriorityDate(left);
    const rightServiceDate = getServicePriorityDate(right);
    if (leftServiceDate && rightServiceDate) {
      const serviceDateDiff = leftServiceDate.getTime() - rightServiceDate.getTime();
      if (serviceDateDiff !== 0) {
        return serviceDateDiff;
      }
    } else if (leftServiceDate || rightServiceDate) {
      return leftServiceDate ? -1 : 1;
    }

    const leftCheckedInAt = parseDateTime(left?.checked_in_at);
    const rightCheckedInAt = parseDateTime(right?.checked_in_at);
    if (leftCheckedInAt && rightCheckedInAt) {
      const checkedInDiff = leftCheckedInAt.getTime() - rightCheckedInAt.getTime();
      if (checkedInDiff !== 0) {
        return checkedInDiff;
      }
    } else if (leftCheckedInAt || rightCheckedInAt) {
      return leftCheckedInAt ? -1 : 1;
    }

    const leftQueueNumber = getQueueNumberValue(left);
    const rightQueueNumber = getQueueNumberValue(right);

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
  const queuesInTrainingOrder = buildServiceOrderItems(queueLikeItems);
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

const runCatboostServiceInference = async ({ featureRow }) => {
  if (typeof fetch !== "function") {
    throw new Error("fetch API is not available in this Node.js runtime");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QUEUE_AI_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${QUEUE_AI_SERVICE_URL.replace(/\/$/, "")}/predict/wait-time`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_path: QUEUE_AI_CATBOOST_MODEL_PATH,
        feature_row: featureRow,
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let parsed = null;
    try {
      parsed = responseText ? JSON.parse(responseText) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const errorMessage =
        parsed?.detail ||
        parsed?.message ||
        responseText ||
        `AI service responded with HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    if (!parsed) {
      throw new Error("AI service returned empty response");
    }

    return parsed;
  } finally {
    clearTimeout(timeoutId);
  }
};

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

  const supportedProviders = new Set(["catboost_local", "catboost_service"]);
  if (!supportedProviders.has(QUEUE_AI_FORECAST_PROVIDER)) {
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

  if (
    QUEUE_AI_FORECAST_PROVIDER === "catboost_local" &&
    !fs.existsSync(QUEUE_AI_CATBOOST_PYTHON_BIN)
  ) {
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

  let inferenceResult = null;
  let inferenceRuntime = QUEUE_AI_FORECAST_PROVIDER;
  let serviceFallbackReason = null;

  if (QUEUE_AI_FORECAST_PROVIDER === "catboost_service") {
    try {
      inferenceResult = await runCatboostServiceInference({ featureRow });
      inferenceRuntime = "catboost_service";
    } catch (error) {
      serviceFallbackReason = error.message;
      if (!fs.existsSync(QUEUE_AI_CATBOOST_PYTHON_BIN)) {
        throw error;
      }

      inferenceResult = await runCatboostInference({ featureRow });
      inferenceRuntime = "catboost_local_fallback";
    }
  } else {
    inferenceResult = await runCatboostInference({ featureRow });
    inferenceRuntime = "catboost_local";
  }

  const predictedWaitMinutes = clampWaitMinutes(inferenceResult?.predicted_wait_minutes);
  const artifactMetadata = getCatboostArtifactMetadata();
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
    prediction_source:
      QUEUE_AI_FORECAST_PROVIDER === "catboost_service"
        ? "ai_catboost_service"
        : "ai_catboost_local",
    provider: QUEUE_AI_FORECAST_PROVIDER,
    model_version: inferenceResult?.model_version || buildRuntimeModelVersion(artifactMetadata),
    feature_row: featureRow,
    model_metadata: {
      ...artifactMetadata,
      service_url: QUEUE_AI_FORECAST_PROVIDER === "catboost_service" ? QUEUE_AI_SERVICE_URL : null,
      runtime: inferenceResult?.runtime || inferenceRuntime,
      service_fallback_reason: serviceFallbackReason,
      model_path: inferenceResult?.model_path || QUEUE_AI_CATBOOST_MODEL_PATH,
    },
    comparison,
  };
};
