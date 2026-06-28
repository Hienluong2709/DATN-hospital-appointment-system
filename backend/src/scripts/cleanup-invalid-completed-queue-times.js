import db from "../models/index.js";
import associateModels from "../models/associations.js";

const { sequelize, Queue, Appointment, WaitPrediction } = db;

associateModels(db);

const CLEANUP_PREDICTION_SOURCE = "invalid_completed_time_cleanup";
const CLEANUP_MODEL_VERSION = "invalid_completed_time_cleanup_v1";
const MIN_VISIT_MINUTES = Number(process.env.MIN_CLEANUP_VISIT_MINUTES || 8);
const MAX_VISIT_MINUTES = Number(process.env.MAX_CLEANUP_VISIT_MINUTES || 90);
const MAX_WAIT_MINUTES = Number(process.env.MAX_CLEANUP_WAIT_MINUTES || 480);
const MAX_DELAY_FROM_ORIGINAL_MINUTES = Number(process.env.MAX_CLEANUP_DELAY_FROM_ORIGINAL_MINUTES || 360);
const DEFAULT_VISIT_MINUTES = Number(process.env.DEFAULT_CLEANUP_VISIT_MINUTES || 24);

const isDryRun = process.argv.includes("--dry-run");

const getArgValue = (flagName) => {
  const target = process.argv.find((item) => item.startsWith(`${flagName}=`));
  return target ? target.slice(flagName.length + 1) : null;
};

const targetQueueIds = (getArgValue("--queue-ids") || "")
  .split(",")
  .map((item) => Number(item.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);

const parseDateTime = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addMinutes = (dateValue, minutes) =>
  new Date(dateValue.getTime() + minutes * 60 * 1000);

const diffMinutes = (start, end) => {
  const left = parseDateTime(start);
  const right = parseDateTime(end);
  if (!left || !right) {
    return null;
  }

  return Math.round((right.getTime() - left.getTime()) / 60000);
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const buildDeterministicVisitMinutes = (queueId) =>
  clamp(DEFAULT_VISIT_MINUTES + ((Number(queueId) % 9) - 4) * 2, MIN_VISIT_MINUTES, 45);

const isInvalidCompletedTiming = (queue) => {
  if (queue.Appointment?.status !== "Completed") {
    return false;
  }

  const checkedInAt = parseDateTime(queue.checked_in_at);
  const actualStart = parseDateTime(queue.actual_start);
  const actualEnd = parseDateTime(queue.actual_end);
  if (!checkedInAt || !actualStart || !actualEnd) {
    return false;
  }

  const visitMinutes = diffMinutes(actualStart, actualEnd);
  const waitMinutes = diffMinutes(checkedInAt, actualStart);
  const delayFromOriginalMinutes = diffMinutes(queue.original_estimated_start, actualStart);

  return (
    visitMinutes === null ||
    waitMinutes === null ||
    actualEnd <= actualStart ||
    visitMinutes < MIN_VISIT_MINUTES ||
    visitMinutes > MAX_VISIT_MINUTES ||
    waitMinutes < 0 ||
    waitMinutes > MAX_WAIT_MINUTES ||
    (delayFromOriginalMinutes !== null && Math.abs(delayFromOriginalMinutes) > MAX_DELAY_FROM_ORIGINAL_MINUTES)
  );
};

const buildNormalizedTiming = (queue) => {
  const checkedInAt = parseDateTime(queue.checked_in_at);
  const actualStart = parseDateTime(queue.actual_start);
  const actualEnd = parseDateTime(queue.actual_end);
  const estimatedStart = parseDateTime(queue.estimated_start);
  const originalEstimatedStart = parseDateTime(queue.original_estimated_start);
  const visitMinutes = diffMinutes(actualStart, actualEnd);
  const waitMinutes = diffMinutes(checkedInAt, actualStart);
  const delayFromOriginalMinutes = diffMinutes(originalEstimatedStart, actualStart);

  let normalizedStart = actualStart;
  if (waitMinutes === null || waitMinutes < 0 || waitMinutes > MAX_WAIT_MINUTES) {
    const candidateStart = estimatedStart || originalEstimatedStart || addMinutes(checkedInAt, 30);
    normalizedStart = candidateStart < checkedInAt ? addMinutes(checkedInAt, 5) : candidateStart;
  }

  const normalizedVisitMinutes =
    visitMinutes !== null && visitMinutes >= MIN_VISIT_MINUTES && visitMinutes <= MAX_VISIT_MINUTES
      ? visitMinutes
      : buildDeterministicVisitMinutes(queue.id);
  const normalizedEnd = addMinutes(normalizedStart, normalizedVisitMinutes);
  const normalizedPredictedWait = Math.max(0, diffMinutes(checkedInAt, normalizedStart) ?? 0);
  const normalizedOriginalEstimatedStart =
    delayFromOriginalMinutes !== null &&
    Math.abs(delayFromOriginalMinutes) > MAX_DELAY_FROM_ORIGINAL_MINUTES
      ? normalizedStart
      : originalEstimatedStart;

  return {
    checked_in_at: checkedInAt,
    actual_start: normalizedStart,
    actual_end: normalizedEnd,
    original_estimated_start: normalizedOriginalEstimatedStart,
    estimated_start: normalizedStart,
    predicted_wait_minutes: normalizedPredictedWait,
    visit_minutes_before: visitMinutes,
    wait_minutes_before: waitMinutes,
    visit_minutes_after: normalizedVisitMinutes,
    wait_minutes_after: normalizedPredictedWait,
  };
};

const main = async () => {
  const queues = await Queue.findAll({
    where: targetQueueIds.length ? { id: targetQueueIds } : undefined,
    include: [
      {
        model: Appointment,
        attributes: ["id", "status", "date", "reason"],
      },
    ],
    order: [["id", "ASC"]],
  });

  const summary = {
    dry_run: isDryRun,
    scanned: queues.length,
    fixed: 0,
    skipped: 0,
    items: [],
  };

  for (const queue of queues) {
    if (!isInvalidCompletedTiming(queue)) {
      summary.skipped += 1;
      continue;
    }

    const normalizedTiming = buildNormalizedTiming(queue);

    await sequelize.transaction(async (transaction) => {
      const lockedQueue = await Queue.findByPk(queue.id, {
        include: [{ model: Appointment, attributes: ["id", "status", "date", "reason"] }],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!lockedQueue || !isInvalidCompletedTiming(lockedQueue)) {
        summary.skipped += 1;
        return;
      }

      let prediction = null;
      if (!isDryRun) {
        prediction = await WaitPrediction.create(
          {
            queue_id: lockedQueue.id,
            predicted_wait_time: normalizedTiming.predicted_wait_minutes,
            predicted_start: normalizedTiming.estimated_start,
            prediction_source: CLEANUP_PREDICTION_SOURCE,
            model_version: CLEANUP_MODEL_VERSION,
            created_at: new Date(),
          },
          { transaction },
        );

        await lockedQueue.update(
          {
            actual_start: normalizedTiming.actual_start,
            actual_end: normalizedTiming.actual_end,
            original_estimated_start: normalizedTiming.original_estimated_start,
            estimated_start: normalizedTiming.estimated_start,
            predicted_wait_minutes: normalizedTiming.predicted_wait_minutes,
            latest_prediction_id: prediction.id,
            forecast_updated_at: new Date(),
          },
          { transaction },
        );
      }

      summary.fixed += 1;
      summary.items.push({
        queue_id: lockedQueue.id,
        appointment_id: lockedQueue.appointment_id,
        reason: lockedQueue.Appointment?.reason ?? null,
        visit_minutes_before: normalizedTiming.visit_minutes_before,
        wait_minutes_before: normalizedTiming.wait_minutes_before,
        actual_start_after: normalizedTiming.actual_start.toISOString(),
        actual_end_after: normalizedTiming.actual_end.toISOString(),
        original_estimated_start_after: normalizedTiming.original_estimated_start?.toISOString() ?? null,
        visit_minutes_after: normalizedTiming.visit_minutes_after,
        wait_minutes_after: normalizedTiming.wait_minutes_after,
        latest_prediction_id_after: prediction?.id ?? lockedQueue.latest_prediction_id ?? null,
      });
    });
  }

  console.info(JSON.stringify(summary, null, 2));
};

main()
  .catch((error) => {
    console.error("[invalid completed queue cleanup] fatal:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
