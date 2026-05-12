import { Op } from "sequelize";

import db from "../models/index.js";
import {
  createQueueAiForecastContextService,
  predictCheckedInQueueWaitMinutesService,
} from "./queueAiForecastService.js";

const { Queue, Appointment, WaitPrediction, WorkSchedule, WorkScheduleBlock } = db;

const DEFAULT_QUEUE_VISIT_DURATION_MINUTES =
  Number(process.env.DEFAULT_QUEUE_VISIT_DURATION_MINUTES) || 15;
const DEFAULT_APPOINTMENT_SLOT_MINUTES =
  Number(process.env.APPOINTMENT_SLOT_MINUTES) || 30;
const DEFAULT_QUEUE_TURNAROUND_MINUTES =
  Number(process.env.QUEUE_TURNAROUND_MINUTES) || 5;
const RULE_ENGINE_FORECAST_SOURCE = process.env.FORECAST_SOURCE || "rule_engine";
const RULE_ENGINE_MODEL_VERSION = process.env.FORECAST_MODEL_VERSION || "rule_engine_v1";
const RECENT_COMPLETED_QUEUE_SAMPLE_SIZE =
  Number(process.env.RECENT_COMPLETED_QUEUE_SAMPLE_SIZE) || 20;
const MIN_QUEUE_VISIT_DURATION_MINUTES = 5;
const MAX_QUEUE_VISIT_DURATION_MINUTES = 180;
const MAX_DYNAMIC_FORECAST_VISIT_DURATION_MINUTES =
  Number(process.env.MAX_DYNAMIC_FORECAST_VISIT_DURATION_MINUTES) || 60;
const MIN_DYNAMIC_DURATION_SAMPLES =
  Number(process.env.MIN_DYNAMIC_DURATION_SAMPLES) || 3;
const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";
const QUEUE_AI_COMPARE_WITH_HEURISTIC =
  process.env.QUEUE_AI_COMPARE_WITH_HEURISTIC === "true";
const APPOINTMENT_PREFERRED_PERIOD = Object.freeze({
  MORNING: "MORNING",
  AFTERNOON: "AFTERNOON",
});
const AFTERNOON_START_SECONDS = 12 * 3600;
const FORECAST_EXCLUDED_APPOINTMENT_STATUSES = new Set(["Cancelled", "NoShow"]);

const shouldExcludeFromActiveForecast = (queueLike) =>
  FORECAST_EXCLUDED_APPOINTMENT_STATUSES.has(queueLike?.Appointment?.status);

const parseUtcOffsetToMinutes = (offsetValue) => {
  const matched = /^([+-])(\d{2}):(\d{2})$/.exec(offsetValue);
  if (!matched) {
    throw new Error("BUSINESS_TIMEZONE_OFFSET không hợp lệ");
  }

  const sign = matched[1] === "+" ? 1 : -1;
  return sign * (Number(matched[2]) * 60 + Number(matched[3]));
};

const BUSINESS_TIMEZONE_OFFSET_MINUTES = parseUtcOffsetToMinutes(BUSINESS_TIMEZONE_OFFSET);

const parseDateParts = (dateValue) => {
  const [year, month, day] = String(dateValue).split("-").map(Number);
  return { year, month, day };
};

const getCurrentBusinessDateAndSeconds = () => {
  const shifted = new Date(Date.now() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");

  return {
    date: `${year}-${month}-${day}`,
    seconds:
      shifted.getUTCHours() * 3600 +
      shifted.getUTCMinutes() * 60 +
      shifted.getUTCSeconds(),
  };
};

const getDayOfWeekFromDate = (dateValue) => {
  const { year, month, day } = parseDateParts(dateValue);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const timeToSeconds = (timeValue) => {
  const [hours, minutes, seconds] = String(timeValue).slice(0, 8).split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};

const secondsToTime = (secondsValue) => {
  const hours = String(Math.floor(secondsValue / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((secondsValue % 3600) / 60)).padStart(2, "0");
  const seconds = String(secondsValue % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

const toTimeString = (value) => String(value).slice(0, 8);

const doesTimeRangeOverlap = (startA, endA, startB, endB) => {
  return startA < endB && endA > startB;
};

const isSlotBlocked = (slotTime, slotMinutes, blockRanges) => {
  const slotStart = timeToSeconds(slotTime);
  const slotEnd = slotStart + slotMinutes * 60;

  return blockRanges.some((block) =>
    doesTimeRangeOverlap(slotStart, slotEnd, block.startSeconds, block.endSeconds),
  );
};

const buildTimeSlots = (startTime, endTime, slotMinutes) => {
  const stepSeconds = slotMinutes * 60;
  const slots = [];
  const startSeconds = timeToSeconds(startTime);
  const endSeconds = timeToSeconds(endTime);

  for (let cursor = startSeconds; cursor + stepSeconds <= endSeconds; cursor += stepSeconds) {
    slots.push(secondsToTime(cursor));
  }

  return slots;
};

const filterPastSlotsForDate = (slots, date, slotMinutes) => {
  const { date: currentBusinessDate, seconds: currentBusinessSeconds } = getCurrentBusinessDateAndSeconds();

  if (date !== currentBusinessDate) {
    return slots;
  }

  return slots.filter((slot) => timeToSeconds(slot) + slotMinutes * 60 > currentBusinessSeconds);
};

const isSlotWithinPreferredPeriod = (slotTime, preferredPeriod) => {
  if (!preferredPeriod) {
    return true;
  }

  const slotStartSeconds = timeToSeconds(slotTime);
  if (preferredPeriod === APPOINTMENT_PREFERRED_PERIOD.MORNING) {
    return slotStartSeconds < AFTERNOON_START_SECONDS;
  }

  if (preferredPeriod === APPOINTMENT_PREFERRED_PERIOD.AFTERNOON) {
    return slotStartSeconds >= AFTERNOON_START_SECONDS;
  }

  return true;
};

const filterSlotsByPreferredPeriod = (slots, preferredPeriod) => {
  if (!preferredPeriod) {
    return slots;
  }

  return slots.filter((slot) => isSlotWithinPreferredPeriod(slot, preferredPeriod));
};

const parseDateTimeAtBusinessOffset = (dateValue, timeValue) => {
  const { year, month, day } = parseDateParts(dateValue);
  const [hour, minute, second] = String(timeValue).slice(0, 8).split(":").map(Number);
  const utcTimestamp =
    Date.UTC(year, month - 1, day, hour, minute, second) -
    BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcTimestamp);
};

const clampDurationMinutes = (value) => {
  return Math.min(
    MAX_QUEUE_VISIT_DURATION_MINUTES,
    Math.max(MIN_QUEUE_VISIT_DURATION_MINUTES, value),
  );
};

const median = (values) => {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middleIndex - 1] + sorted[middleIndex]) / 2;
  }

  return sorted[middleIndex];
};

const trimmedAverage = (values, trimRatio = 0.15) => {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const trimCount = Math.min(
    Math.floor(sorted.length * trimRatio),
    Math.max(0, Math.floor((sorted.length - 1) / 2)),
  );
  const trimmedValues = sorted.slice(trimCount, sorted.length - trimCount);

  if (!trimmedValues.length) {
    return sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  }

  return trimmedValues.reduce((sum, value) => sum + value, 0) / trimmedValues.length;
};

const maxDate = (...values) => {
  const validDates = values.filter((value) => value instanceof Date && !Number.isNaN(value.getTime()));
  if (validDates.length === 0) {
    return null;
  }

  return new Date(Math.max(...validDates.map((value) => value.getTime())));
};

const addMinutes = (dateValue, minutes) => {
  return new Date(dateValue.getTime() + minutes * 60 * 1000);
};

const buildInProgressForecastCursor = ({
  actualStart,
  averageVisitDurationMs,
  turnaroundBufferMs,
  now,
}) => {
  if (!(actualStart instanceof Date) || Number.isNaN(actualStart.getTime())) {
    return null;
  }

  return maxDate(
    new Date(actualStart.getTime() + averageVisitDurationMs + turnaroundBufferMs),
    new Date(now.getTime() + turnaroundBufferMs),
  );
};

const getEarliestEligibleStartTime = ({
  checkedInAt,
  originalScheduledTime,
  earliestWorkingDateTime,
}) => {
  if (!(originalScheduledTime instanceof Date) || Number.isNaN(originalScheduledTime.getTime())) {
    return earliestWorkingDateTime || null;
  }

  return maxDate(originalScheduledTime, earliestWorkingDateTime);
};

const computePredictedWaitMinutesFromAnchor = (predictedStart, anchorDate) => {
  if (!(predictedStart instanceof Date) || Number.isNaN(predictedStart.getTime())) {
    return null;
  }

  if (!(anchorDate instanceof Date) || Number.isNaN(anchorDate.getTime())) {
    return null;
  }

  return Math.max(0, Math.ceil((predictedStart.getTime() - anchorDate.getTime()) / (60 * 1000)));
};

const derivePredictedStartFromQueueState = ({
  checkedInAt,
  predictedWaitMinutes,
  minimumStartTime,
  workingPeriods,
  persistedEstimatedStart,
  originalScheduledTime,
  fallbackDateTime,
}) => {
  const normalizeWithinWorkingPeriods = (value) =>
    normalizeDateTimeWithinWorkingPeriods(value, workingPeriods);

  if (
    checkedInAt instanceof Date &&
    !Number.isNaN(checkedInAt.getTime()) &&
    typeof predictedWaitMinutes === "number" &&
    predictedWaitMinutes >= 0
  ) {
    return normalizeWithinWorkingPeriods(
      maxDate(addMinutes(checkedInAt, predictedWaitMinutes), minimumStartTime) ||
      addMinutes(checkedInAt, predictedWaitMinutes)
    );
  }

  return normalizeWithinWorkingPeriods(
    persistedEstimatedStart || originalScheduledTime || fallbackDateTime || null
  );
};

const normalizeDateTimeWithinWorkingPeriods = (dateValue, workingPeriods) => {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
    return dateValue;
  }

  if (!Array.isArray(workingPeriods) || workingPeriods.length === 0) {
    return dateValue;
  }

  const normalizedPeriods = workingPeriods
    .filter(
      (period) =>
        period?.start instanceof Date &&
        !Number.isNaN(period.start.getTime()) &&
        period?.end instanceof Date &&
        !Number.isNaN(period.end.getTime()) &&
        period.end >= period.start,
    )
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  if (normalizedPeriods.length === 0) {
    return dateValue;
  }

  for (const period of normalizedPeriods) {
    if (dateValue < period.start) {
      return new Date(period.start);
    }

    if (dateValue <= period.end) {
      return dateValue;
    }
  }

  return new Date(normalizedPeriods[normalizedPeriods.length - 1].end);
};

const getQueueServicePriorityDate = (queueLike) => {
  const originalEstimatedStart =
    queueLike?.original_estimated_start instanceof Date
      ? queueLike.original_estimated_start
      : queueLike?.original_estimated_start
        ? new Date(queueLike.original_estimated_start)
        : null;
  if (originalEstimatedStart && !Number.isNaN(originalEstimatedStart.getTime())) {
    return originalEstimatedStart;
  }

  const appointmentDate = queueLike?.date || queueLike?.Appointment?.date;
  const timeSlot = queueLike?.Appointment?.time_slot;
  if (appointmentDate && timeSlot) {
    return parseDateTimeAtBusinessOffset(appointmentDate, timeSlot);
  }

  const estimatedStart =
    queueLike?.estimated_start instanceof Date
      ? queueLike.estimated_start
      : queueLike?.estimated_start
        ? new Date(queueLike.estimated_start)
        : null;
  if (estimatedStart && !Number.isNaN(estimatedStart.getTime())) {
    return estimatedStart;
  }

  const checkedInAt =
    queueLike?.checked_in_at instanceof Date
      ? queueLike.checked_in_at
      : queueLike?.checked_in_at
        ? new Date(queueLike.checked_in_at)
        : null;
  if (checkedInAt && !Number.isNaN(checkedInAt.getTime())) {
    return checkedInAt;
  }

  return null;
};

const getQueueCheckedInDate = (queueLike) => {
  const checkedInAt =
    queueLike?.checked_in_at instanceof Date
      ? queueLike.checked_in_at
      : queueLike?.checked_in_at
        ? new Date(queueLike.checked_in_at)
        : null;
  return checkedInAt && !Number.isNaN(checkedInAt.getTime()) ? checkedInAt : null;
};

const getQueueCategoryRank = (queueLike) => {
  if (queueLike?.actual_end) {
    return 0;
  }

  if (queueLike?.actual_start) {
    return 1;
  }

  return 2;
};

export const compareQueuesByServiceOrder = (left, right) => {
  const categoryDelta = getQueueCategoryRank(left) - getQueueCategoryRank(right);
  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  if (left?.actual_end && right?.actual_end) {
    const actualEndDelta = new Date(left.actual_end).getTime() - new Date(right.actual_end).getTime();
    if (actualEndDelta !== 0) {
      return actualEndDelta;
    }
  }

  if (left?.actual_start && right?.actual_start) {
    const actualStartDelta = new Date(left.actual_start).getTime() - new Date(right.actual_start).getTime();
    if (actualStartDelta !== 0) {
      return actualStartDelta;
    }
  }

  const leftPriorityDate = getQueueServicePriorityDate(left);
  const rightPriorityDate = getQueueServicePriorityDate(right);
  if (leftPriorityDate && rightPriorityDate) {
    const priorityDelta = leftPriorityDate.getTime() - rightPriorityDate.getTime();
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
  } else if (leftPriorityDate || rightPriorityDate) {
    return leftPriorityDate ? -1 : 1;
  }

  const leftCheckedInAt = getQueueCheckedInDate(left);
  const rightCheckedInAt = getQueueCheckedInDate(right);
  if (leftCheckedInAt && rightCheckedInAt) {
    const checkedInDelta = leftCheckedInAt.getTime() - rightCheckedInAt.getTime();
    if (checkedInDelta !== 0) {
      return checkedInDelta;
    }
  } else if (leftCheckedInAt || rightCheckedInAt) {
    return leftCheckedInAt ? -1 : 1;
  }

  const leftQueueNumber = Number.isInteger(left?.queue_number) ? left.queue_number : Number.MAX_SAFE_INTEGER;
  const rightQueueNumber = Number.isInteger(right?.queue_number) ? right.queue_number : Number.MAX_SAFE_INTEGER;
  if (leftQueueNumber !== rightQueueNumber) {
    return leftQueueNumber - rightQueueNumber;
  }

  return (left?.id ?? Number.MAX_SAFE_INTEGER) - (right?.id ?? Number.MAX_SAFE_INTEGER);
};

export const getAverageVisitDurationMinutesService = async (doctorId, transaction) => {
  const completedQueues = await Queue.findAll({
    where: {
      doctor_id: doctorId,
      actual_start: { [Op.ne]: null },
      actual_end: { [Op.ne]: null },
    },
    attributes: ["actual_start", "actual_end"],
    order: [["actual_end", "DESC"]],
    limit: RECENT_COMPLETED_QUEUE_SAMPLE_SIZE,
    transaction,
  });

  const durations = completedQueues
    .map((queue) => {
      const actualStart = new Date(queue.actual_start);
      const actualEnd = new Date(queue.actual_end);

      if (Number.isNaN(actualStart.getTime()) || Number.isNaN(actualEnd.getTime()) || actualEnd <= actualStart) {
        return null;
      }

      return (actualEnd.getTime() - actualStart.getTime()) / (60 * 1000);
    })
    .filter((value) => typeof value === "number" && value >= MIN_QUEUE_VISIT_DURATION_MINUTES);

  if (durations.length < MIN_DYNAMIC_DURATION_SAMPLES) {
    return DEFAULT_QUEUE_VISIT_DURATION_MINUTES;
  }

  const sanitizedDurations = durations.map((value) =>
    Math.min(value, MAX_DYNAMIC_FORECAST_VISIT_DURATION_MINUTES),
  );
  const durationMedian = median(sanitizedDurations);
  const durationTrimmedAverage = trimmedAverage(sanitizedDurations);
  const weightedDuration =
    ((durationMedian ?? DEFAULT_QUEUE_VISIT_DURATION_MINUTES) * 0.65) +
    ((durationTrimmedAverage ?? DEFAULT_QUEUE_VISIT_DURATION_MINUTES) * 0.35);

  return clampDurationMinutes(Math.round(weightedDuration));
};

const syncWaitPrediction = async (
  queue,
  predictedWaitMinutes,
  predictedStart,
  transaction,
  predictionMetadata = {},
) => {
  const prediction = await WaitPrediction.create(
    {
      queue_id: queue.id,
      predicted_wait_time: predictedWaitMinutes,
      predicted_start: predictedStart,
      prediction_source:
        predictionMetadata.prediction_source || RULE_ENGINE_FORECAST_SOURCE,
      model_version:
        predictionMetadata.model_version || RULE_ENGINE_MODEL_VERSION,
      created_at: new Date(),
    },
    { transaction },
  );

  await queue.update(
    {
      latest_prediction_id: prediction.id,
    },
    { transaction },
  );
};

const buildRuleBasedWaitingForecast = ({
  checkedInAt,
  forecastCursor,
  originalScheduledTime,
  earliestWorkingDateTime,
  workingPeriods,
  now,
}) => {
  const earliestEligibleStartTime = getEarliestEligibleStartTime({
    checkedInAt,
    originalScheduledTime,
    earliestWorkingDateTime,
  });
  const timingFloor = checkedInAt
    ? maxDate(checkedInAt, now)
    : earliestEligibleStartTime || earliestWorkingDateTime;
  const baseTime = maxDate(
    forecastCursor,
    earliestEligibleStartTime,
    earliestWorkingDateTime,
    timingFloor,
  ) || now;
  const predictionAnchor =
    checkedInAt || originalScheduledTime || earliestWorkingDateTime || baseTime;
  const estimatedStart = derivePredictedStartFromQueueState({
    checkedInAt,
    predictedWaitMinutes:
      computePredictedWaitMinutesFromAnchor(baseTime, predictionAnchor) ?? 0,
    minimumStartTime: baseTime,
    workingPeriods,
    persistedEstimatedStart: baseTime,
    originalScheduledTime,
    fallbackDateTime: baseTime,
  });
  const predictedWaitMinutes =
    computePredictedWaitMinutesFromAnchor(
      estimatedStart,
      checkedInAt || predictionAnchor,
    ) ?? 0;

  return {
    estimated_start: estimatedStart,
    predicted_wait_minutes: predictedWaitMinutes,
    prediction_source: RULE_ENGINE_FORECAST_SOURCE,
    model_version: RULE_ENGINE_MODEL_VERSION,
    base_time: baseTime,
  };
};

const buildAdaptiveWaitingForecast = async ({
  aiContext,
  queueLikeItems,
  queueLike,
  checkedInAt,
  forecastCursor,
  originalScheduledTime,
  earliestWorkingDateTime,
  workingPeriods,
  now,
  averageVisitDurationMinutes,
  turnaroundBufferMinutes,
}) => {
  const ruleBasedForecast = buildRuleBasedWaitingForecast({
    checkedInAt,
    forecastCursor,
    originalScheduledTime,
    earliestWorkingDateTime,
    workingPeriods,
    now,
  });

  if (!(checkedInAt instanceof Date) || Number.isNaN(checkedInAt.getTime())) {
    return ruleBasedForecast;
  }

  try {
    const aiPrediction = await predictCheckedInQueueWaitMinutesService({
      aiContext,
      queueLikeItems,
      queueLike,
      checkedInAt,
      originalScheduledTime,
      latestPredictedStart: ruleBasedForecast.estimated_start,
      ruleBasedWaitMinutes: ruleBasedForecast.predicted_wait_minutes,
      averageVisitDurationMinutes,
      turnaroundBufferMinutes,
    });

    if (
      !aiPrediction?.available ||
      typeof aiPrediction.predicted_wait_minutes !== "number" ||
      aiPrediction.predicted_wait_minutes < 0
    ) {
      return ruleBasedForecast;
    }

    if (QUEUE_AI_COMPARE_WITH_HEURISTIC && aiPrediction?.comparison) {
      console.info(
        [
          `[queue forecast compare] queue#${queueLike?.id ?? "unknown"}`,
          `provider=${aiPrediction.prediction_source || aiContext?.provider || "unknown"}`,
          `model_wait=${aiPrediction.predicted_wait_minutes}`,
          `heuristic_wait=${aiPrediction.comparison.heuristic_predicted_wait_minutes}`,
          `delta=${aiPrediction.comparison.delta_minutes}`,
        ].join(" "),
      );
    }

    const estimatedStart = derivePredictedStartFromQueueState({
      checkedInAt,
      predictedWaitMinutes: aiPrediction.predicted_wait_minutes,
      minimumStartTime: ruleBasedForecast.base_time,
      workingPeriods,
      persistedEstimatedStart: ruleBasedForecast.base_time,
      originalScheduledTime,
      fallbackDateTime: ruleBasedForecast.base_time,
    });

    return {
      estimated_start: estimatedStart,
      predicted_wait_minutes: computePredictedWaitMinutesFromAnchor(
        estimatedStart,
        checkedInAt,
      ) ?? aiPrediction.predicted_wait_minutes,
      prediction_source:
        aiPrediction.prediction_source || RULE_ENGINE_FORECAST_SOURCE,
      model_version: aiPrediction.model_version || RULE_ENGINE_MODEL_VERSION,
      base_time: ruleBasedForecast.base_time,
    };
  } catch (error) {
    console.error(
      `[queue forecast] AI prediction failed for queue/appointment #${queueLike?.id ?? "unknown"}: ${error.message}`,
    );
    return ruleBasedForecast;
  }
};

const getEarliestWorkingDateTimeForDoctorDate = async (doctorId, date, transaction) => {
  const workingPeriods = await getDoctorWorkingPeriodsForDate(doctorId, date, transaction);
  return workingPeriods[0]?.start || null;
};

const getDoctorWorkingPeriodsForDate = async (doctorId, date, transaction) => {
  const dayOfWeek = getDayOfWeekFromDate(date);
  const schedules = await WorkSchedule.findAll({
    where: {
      doctor_id: doctorId,
      day_of_week: dayOfWeek,
    },
    attributes: ["start_time", "end_time"],
    order: [["start_time", "ASC"]],
    transaction,
  });

  if (schedules.length === 0) {
    return [];
  }

  const blocks = await WorkScheduleBlock.findAll({
    where: {
      doctor_id: doctorId,
      date,
      status: "Approved",
    },
    attributes: ["is_off", "start_time", "end_time"],
    transaction,
  });

  if (blocks.some((block) => block.is_off)) {
    return [];
  }

  const blockRanges = blocks
    .filter((block) => !block.is_off && block.start_time && block.end_time)
    .map((block) => ({
      startSeconds: timeToSeconds(toTimeString(block.start_time)),
      endSeconds: timeToSeconds(toTimeString(block.end_time)),
    }))
    .sort((left, right) => left.startSeconds - right.startSeconds);

  const workingPeriods = [];

  for (const schedule of schedules) {
    const scheduleStartSeconds = timeToSeconds(toTimeString(schedule.start_time));
    const scheduleEndSeconds = timeToSeconds(toTimeString(schedule.end_time));

    let cursorSeconds = scheduleStartSeconds;

    for (const block of blockRanges) {
      if (block.endSeconds <= cursorSeconds || block.startSeconds >= scheduleEndSeconds) {
        continue;
      }

      if (block.startSeconds > cursorSeconds) {
        workingPeriods.push({
          start: parseDateTimeAtBusinessOffset(date, secondsToTime(cursorSeconds)),
          end: parseDateTimeAtBusinessOffset(
            date,
            secondsToTime(Math.min(block.startSeconds, scheduleEndSeconds)),
          ),
        });
      }

      cursorSeconds = Math.max(cursorSeconds, Math.min(block.endSeconds, scheduleEndSeconds));

      if (cursorSeconds >= scheduleEndSeconds) {
        break;
      }
    }

    if (cursorSeconds < scheduleEndSeconds) {
      workingPeriods.push({
        start: parseDateTimeAtBusinessOffset(date, secondsToTime(cursorSeconds)),
        end: parseDateTimeAtBusinessOffset(date, secondsToTime(scheduleEndSeconds)),
      });
    }
  }

  return workingPeriods.sort((left, right) => left.start.getTime() - right.start.getTime());
};

const getAvailableSlotsForDoctorDate = async (
  doctorId,
  date,
  preferredPeriod,
  transaction,
  options = {},
) => {
  const shouldFilterPastSlots = options.filterPastSlots === true;
  const dayOfWeek = getDayOfWeekFromDate(date);
  const schedules = await WorkSchedule.findAll({
    where: {
      doctor_id: doctorId,
      day_of_week: dayOfWeek,
    },
    attributes: ["start_time", "end_time"],
    order: [["start_time", "ASC"]],
    transaction,
  });

  if (schedules.length === 0) {
    return [];
  }

  const blocks = await WorkScheduleBlock.findAll({
    where: {
      doctor_id: doctorId,
      date,
      status: "Approved",
    },
    attributes: ["is_off", "start_time", "end_time"],
    transaction,
  });

  if (blocks.some((block) => block.is_off)) {
    return [];
  }

  const candidateSlots = new Set();
  for (const schedule of schedules) {
    const slots = buildTimeSlots(
      toTimeString(schedule.start_time),
      toTimeString(schedule.end_time),
      DEFAULT_APPOINTMENT_SLOT_MINUTES,
    );

    for (const slot of slots) {
      candidateSlots.add(slot);
    }
  }

  const blockRanges = blocks
    .filter((block) => !block.is_off && block.start_time && block.end_time)
    .map((block) => ({
      startSeconds: timeToSeconds(toTimeString(block.start_time)),
      endSeconds: timeToSeconds(toTimeString(block.end_time)),
    }));

  let availableSlots = filterSlotsByPreferredPeriod(
    Array.from(candidateSlots).sort(),
    preferredPeriod ?? null,
  ).filter((slot) => !isSlotBlocked(slot, DEFAULT_APPOINTMENT_SLOT_MINUTES, blockRanges));

  if (shouldFilterPastSlots) {
    availableSlots = filterPastSlotsForDate(
      availableSlots,
      date,
      DEFAULT_APPOINTMENT_SLOT_MINUTES,
    );
  }

  return availableSlots;
};

const estimateOriginalAppointmentDateTime = async (
  appointmentLike,
  transaction,
  options = {},
) => {
  if (!appointmentLike?.doctor_id || !appointmentLike?.date) {
    return null;
  }

  if (appointmentLike.time_slot) {
    return parseDateTimeAtBusinessOffset(appointmentLike.date, appointmentLike.time_slot);
  }

  const availableSlots = await getAvailableSlotsForDoctorDate(
    appointmentLike.doctor_id,
    appointmentLike.date,
    appointmentLike.preferred_period ?? null,
    transaction,
    options,
  );

  if (availableSlots.length === 0) {
    return null;
  }

  const activeAppointments = await Appointment.findAll({
    where: {
      doctor_id: appointmentLike.doctor_id,
      date: appointmentLike.date,
      status: {
        [Op.in]: ["Confirmed", "CheckedIn", "Completed"],
      },
      id: {
        [Op.lt]: appointmentLike.id ?? Number.MAX_SAFE_INTEGER,
      },
    },
    attributes: ["id", "time_slot", "preferred_period"],
    transaction,
  });

  const activeAppointmentsCount = activeAppointments.filter((item) => {
    if (appointmentLike.preferred_period) {
      if (item.time_slot) {
        return isSlotWithinPreferredPeriod(toTimeString(item.time_slot), appointmentLike.preferred_period);
      }

      return item.preferred_period === appointmentLike.preferred_period;
    }

    return true;
  }).length;

  const estimatedSlot = availableSlots[Math.min(activeAppointmentsCount, availableSlots.length - 1)];
  return estimatedSlot ? parseDateTimeAtBusinessOffset(appointmentLike.date, estimatedSlot) : null;
};

const estimateOriginalQueueDateTime = async (queueLike, transaction) => {
  if (!queueLike?.doctor_id || !queueLike?.date) {
    return null;
  }

  if (queueLike?.Appointment?.time_slot) {
    return parseDateTimeAtBusinessOffset(queueLike.date, queueLike.Appointment.time_slot);
  }

  if (!Number.isInteger(queueLike?.queue_number) || queueLike.queue_number <= 0) {
    return estimateOriginalAppointmentDateTime(queueLike?.Appointment, transaction, {
      filterPastSlots: false,
    });
  }

  const availableSlots = await getAvailableSlotsForDoctorDate(
    queueLike.doctor_id,
    queueLike.date,
    queueLike?.Appointment?.preferred_period ?? null,
    transaction,
    { filterPastSlots: false },
  );

  if (!availableSlots.length) {
    return null;
  }

  const estimatedSlot = availableSlots[Math.min(queueLike.queue_number - 1, availableSlots.length - 1)];
  return estimatedSlot ? parseDateTimeAtBusinessOffset(queueLike.date, estimatedSlot) : null;
};

export const simulateEstimatedStartForAppointmentService = async (appointmentLike, transaction) => {
  if (!appointmentLike?.doctor_id || !appointmentLike?.date) {
    return null;
  }

  const averageVisitDurationMinutes = await getAverageVisitDurationMinutesService(
    appointmentLike.doctor_id,
    transaction,
  );
  const averageVisitDurationMs = averageVisitDurationMinutes * 60 * 1000;
  const turnaroundBufferMs = DEFAULT_QUEUE_TURNAROUND_MINUTES * 60 * 1000;
  const now = new Date();
  const workingPeriods = await getDoctorWorkingPeriodsForDate(
    appointmentLike.doctor_id,
    appointmentLike.date,
    transaction,
  );
  const earliestWorkingDateTime = workingPeriods[0]?.start || null;
  const originalScheduledTime = await estimateOriginalAppointmentDateTime(appointmentLike, transaction, {
    filterPastSlots: false,
  });

  if (appointmentLike.status !== "CheckedIn") {
    const stableEstimatedStart = originalScheduledTime || earliestWorkingDateTime || null;
    return stableEstimatedStart
      ? {
          original_estimated_start: stableEstimatedStart,
          estimated_start: stableEstimatedStart,
          predicted_wait_minutes: null,
          prediction_source: RULE_ENGINE_FORECAST_SOURCE,
          model_version: RULE_ENGINE_MODEL_VERSION,
        }
      : null;
  }

  const aiContext = await createQueueAiForecastContextService({
    doctorId: appointmentLike.doctor_id,
    transaction,
  });
  const queues = await Queue.findAll({
    where: {
      doctor_id: appointmentLike.doctor_id,
      date: appointmentLike.date,
    },
    include: [
      {
        model: Appointment,
        attributes: ["id", "doctor_id", "date", "status", "time_slot", "preferred_period"],
      },
    ],
    transaction,
  });

  const virtualQueue = {
    id: appointmentLike.id ?? Number.MAX_SAFE_INTEGER,
    doctor_id: appointmentLike.doctor_id,
    date: appointmentLike.date,
    queue_number: Number.MAX_SAFE_INTEGER,
    checked_in_at: null,
    actual_start: null,
    actual_end: null,
    estimated_start: originalScheduledTime,
    original_estimated_start: originalScheduledTime,
    predicted_wait_minutes: null,
    Appointment: {
      id: appointmentLike.id ?? Number.MAX_SAFE_INTEGER,
      doctor_id: appointmentLike.doctor_id,
      date: appointmentLike.date,
      status: appointmentLike.status ?? "Confirmed",
      time_slot: appointmentLike.time_slot ?? null,
      preferred_period: appointmentLike.preferred_period ?? null,
    },
  };

  const activeQueues = queues.filter((queue) => !shouldExcludeFromActiveForecast(queue));
  const queueLikeItems = [...activeQueues, virtualQueue].sort(compareQueuesByServiceOrder);
  let forecastCursor = null;

  for (const queue of queueLikeItems) {
    const checkedInAt =
      queue.checked_in_at instanceof Date
        ? queue.checked_in_at
        : queue.checked_in_at
          ? new Date(queue.checked_in_at)
          : null;
    const persistedOriginalEstimatedStart =
      queue.original_estimated_start instanceof Date
        ? queue.original_estimated_start
        : queue.original_estimated_start
          ? new Date(queue.original_estimated_start)
          : null;
    const persistedEstimatedStart =
      queue.estimated_start instanceof Date
        ? queue.estimated_start
        : queue.estimated_start
          ? new Date(queue.estimated_start)
          : null;
    const persistedPredictedWaitMinutes =
      typeof queue.predicted_wait_minutes === "number" && queue.predicted_wait_minutes >= 0
        ? queue.predicted_wait_minutes
        : null;
    const queueOriginalScheduledTime =
      queue === virtualQueue
        ? originalScheduledTime
        : await estimateOriginalQueueDateTime(queue, transaction) || persistedOriginalEstimatedStart;
    const shouldRestoreOverwrittenEstimate =
      !!persistedEstimatedStart &&
      !!queue.actual_start &&
      persistedEstimatedStart.getTime() === new Date(queue.actual_start).getTime() &&
      !!queueOriginalScheduledTime;

    let estimatedStart = shouldRestoreOverwrittenEstimate
      ? queueOriginalScheduledTime
      : persistedEstimatedStart || queueOriginalScheduledTime || earliestWorkingDateTime;
    let predictedWaitMinutes = persistedPredictedWaitMinutes;
    let predictionSource = RULE_ENGINE_FORECAST_SOURCE;
    let modelVersion = RULE_ENGINE_MODEL_VERSION;
    const predictedWaitFromEstimatedStart = computePredictedWaitMinutesFromAnchor(
      estimatedStart,
      checkedInAt,
    );

    if (
      predictedWaitFromEstimatedStart !== null &&
      (predictedWaitMinutes === null || predictedWaitMinutes !== predictedWaitFromEstimatedStart)
    ) {
      predictedWaitMinutes = predictedWaitFromEstimatedStart;
    }

    if (queue.actual_start && queue.actual_end) {
      if (predictedWaitMinutes === null) {
        predictedWaitMinutes = computePredictedWaitMinutesFromAnchor(estimatedStart, checkedInAt) ?? 0;
      }
      forecastCursor = maxDate(
        forecastCursor,
        new Date(new Date(queue.actual_end).getTime() + turnaroundBufferMs),
      );
    } else if (queue.actual_start) {
      const actualStartDate = new Date(queue.actual_start);
      if (predictedWaitMinutes === null) {
        predictedWaitMinutes = computePredictedWaitMinutesFromAnchor(estimatedStart, checkedInAt) ?? 0;
      }
      forecastCursor = maxDate(
        forecastCursor,
        buildInProgressForecastCursor({
          actualStart: actualStartDate,
          averageVisitDurationMs,
          turnaroundBufferMs,
          now,
        }),
      );
    } else {
      const adaptiveForecast = await buildAdaptiveWaitingForecast({
        aiContext,
        queueLikeItems,
        queueLike: queue,
        checkedInAt,
        forecastCursor,
        originalScheduledTime: queueOriginalScheduledTime,
        earliestWorkingDateTime,
        workingPeriods,
        now,
        averageVisitDurationMinutes,
        turnaroundBufferMinutes: DEFAULT_QUEUE_TURNAROUND_MINUTES,
      });

      predictedWaitMinutes = adaptiveForecast.predicted_wait_minutes;
      estimatedStart = adaptiveForecast.estimated_start;
      predictionSource = adaptiveForecast.prediction_source;
      modelVersion = adaptiveForecast.model_version;
      forecastCursor = new Date(estimatedStart.getTime() + averageVisitDurationMs + turnaroundBufferMs);
    }

    if (queue === virtualQueue) {
      const originalEstimatedStart =
        queueOriginalScheduledTime || persistedOriginalEstimatedStart || estimatedStart;

      return {
        original_estimated_start: originalEstimatedStart,
        estimated_start: estimatedStart,
        predicted_wait_minutes: predictedWaitMinutes,
        prediction_source: predictionSource,
        model_version: modelVersion,
      };
    }
  }

  const fallbackStart = originalScheduledTime || earliestWorkingDateTime || null;
  return fallbackStart
    ? {
        original_estimated_start: originalScheduledTime || fallbackStart,
        estimated_start: fallbackStart,
        predicted_wait_minutes: null,
      }
    : null;
};

export const recalculateQueueForecastForDoctorDateService = async (doctorId, date, transaction) => {
  if (!doctorId || !date) {
    return;
  }

  const averageVisitDurationMinutes = await getAverageVisitDurationMinutesService(doctorId, transaction);
  const averageVisitDurationMs = averageVisitDurationMinutes * 60 * 1000;
  const turnaroundBufferMs = DEFAULT_QUEUE_TURNAROUND_MINUTES * 60 * 1000;
  const now = new Date();
  const workingPeriods = await getDoctorWorkingPeriodsForDate(doctorId, date, transaction);
  const earliestWorkingDateTime = workingPeriods[0]?.start || null;
  const aiContext = await createQueueAiForecastContextService({
    doctorId,
    transaction,
  });
  const queues = await Queue.findAll({
    where: {
      doctor_id: doctorId,
      date,
    },
    include: [
      {
        model: Appointment,
        attributes: ["id", "doctor_id", "date", "status", "time_slot", "preferred_period"],
      },
    ],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  const activeQueues = queues
    .filter((queue) => !shouldExcludeFromActiveForecast(queue))
    .sort(compareQueuesByServiceOrder);

  let forecastCursor = null;

  for (const queue of activeQueues) {
    const checkedInAt =
      queue.checked_in_at instanceof Date
        ? queue.checked_in_at
        : queue.checked_in_at
          ? new Date(queue.checked_in_at)
          : null;
    const persistedOriginalEstimatedStart =
      queue.original_estimated_start instanceof Date
        ? queue.original_estimated_start
        : queue.original_estimated_start
          ? new Date(queue.original_estimated_start)
          : null;
    const persistedEstimatedStart =
      queue.estimated_start instanceof Date
        ? queue.estimated_start
        : queue.estimated_start
          ? new Date(queue.estimated_start)
          : null;
    const persistedPredictedWaitMinutes =
      typeof queue.predicted_wait_minutes === "number" && queue.predicted_wait_minutes >= 0
        ? queue.predicted_wait_minutes
        : null;
    const originalScheduledTime =
      await estimateOriginalQueueDateTime(queue, transaction) || persistedOriginalEstimatedStart;
    const shouldRestoreOverwrittenEstimate =
      !!persistedEstimatedStart &&
      !!queue.actual_start &&
      persistedEstimatedStart.getTime() === new Date(queue.actual_start).getTime() &&
      !!originalScheduledTime;
    let estimatedStart = shouldRestoreOverwrittenEstimate
      ? originalScheduledTime
      : persistedEstimatedStart || originalScheduledTime || earliestWorkingDateTime;
    let predictedWaitMinutes = persistedPredictedWaitMinutes;
    let predictionSource = RULE_ENGINE_FORECAST_SOURCE;
    let modelVersion = RULE_ENGINE_MODEL_VERSION;
    const predictedWaitFromEstimatedStart = computePredictedWaitMinutesFromAnchor(
      estimatedStart,
      checkedInAt,
    );

    if (
      predictedWaitFromEstimatedStart !== null &&
      (predictedWaitMinutes === null || predictedWaitMinutes !== predictedWaitFromEstimatedStart)
    ) {
      predictedWaitMinutes = predictedWaitFromEstimatedStart;
    }

    if (queue.actual_start && queue.actual_end) {
      if (predictedWaitMinutes === null) {
        predictedWaitMinutes = computePredictedWaitMinutesFromAnchor(estimatedStart, checkedInAt) ?? 0;
      }
      forecastCursor = maxDate(
        forecastCursor,
        new Date(new Date(queue.actual_end).getTime() + turnaroundBufferMs),
      );
    } else if (queue.actual_start) {
      const actualStartDate = new Date(queue.actual_start);
      if (predictedWaitMinutes === null) {
        predictedWaitMinutes = computePredictedWaitMinutesFromAnchor(estimatedStart, checkedInAt) ?? 0;
      }
      forecastCursor = maxDate(
        forecastCursor,
        buildInProgressForecastCursor({
          actualStart: actualStartDate,
          averageVisitDurationMs,
          turnaroundBufferMs,
          now,
        }),
      );
    } else {
      const adaptiveForecast = await buildAdaptiveWaitingForecast({
        aiContext,
        queueLikeItems: activeQueues,
        queueLike: queue,
        checkedInAt,
        forecastCursor,
        originalScheduledTime,
        earliestWorkingDateTime,
        workingPeriods,
        now,
        averageVisitDurationMinutes,
        turnaroundBufferMinutes: DEFAULT_QUEUE_TURNAROUND_MINUTES,
      });

      predictedWaitMinutes = adaptiveForecast.predicted_wait_minutes;
      estimatedStart = adaptiveForecast.estimated_start;
      predictionSource = adaptiveForecast.prediction_source;
      modelVersion = adaptiveForecast.model_version;
      forecastCursor = new Date(estimatedStart.getTime() + averageVisitDurationMs + turnaroundBufferMs);
    }

    const originalEstimatedStart = originalScheduledTime || persistedOriginalEstimatedStart || estimatedStart;
    const shouldUpdateOriginalEstimatedStart =
      !queue.original_estimated_start ||
      new Date(queue.original_estimated_start).getTime() !== originalEstimatedStart.getTime();
    const shouldUpdateEstimatedStart =
      !queue.estimated_start ||
      new Date(queue.estimated_start).getTime() !== estimatedStart.getTime();
    const shouldUpdatePredictedWait = queue.predicted_wait_minutes !== predictedWaitMinutes;

    if (shouldUpdateOriginalEstimatedStart || shouldUpdateEstimatedStart || shouldUpdatePredictedWait) {
      await queue.update(
        {
          original_estimated_start: originalEstimatedStart,
          estimated_start: estimatedStart,
          predicted_wait_minutes: predictedWaitMinutes,
          forecast_updated_at: new Date(),
        },
        { transaction },
      );
    }

    await syncWaitPrediction(queue, predictedWaitMinutes, estimatedStart, transaction, {
      prediction_source: predictionSource,
      model_version: modelVersion,
    });
  }
};
