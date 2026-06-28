import db from "../models/index.js";
import associateModels from "../models/associations.js";

const { sequelize, Queue, WaitPrediction } = db;

associateModels(db);

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";

const parseUtcOffsetToMinutes = (offsetValue) => {
  const matched = /^([+-])(\d{2}):(\d{2})$/.exec(offsetValue || "");
  if (!matched) {
    throw new Error("BUSINESS_TIMEZONE_OFFSET không hợp lệ, định dạng yêu cầu +/-HH:mm");
  }

  const [, sign, hourText, minuteText] = matched;
  const hours = Number(hourText);
  const minutes = Number(minuteText);

  if (hours > 23 || minutes > 59) {
    throw new Error("BUSINESS_TIMEZONE_OFFSET không hợp lệ, giá trị giờ/phút vượt ngưỡng");
  }

  const totalMinutes = hours * 60 + minutes;
  return sign === "-" ? -totalMinutes : totalMinutes;
};

const BUSINESS_TIMEZONE_OFFSET_MINUTES = parseUtcOffsetToMinutes(BUSINESS_TIMEZONE_OFFSET);

const parseDateTime = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const subtractMinutes = (dateValue, minutes) => {
  return new Date(dateValue.getTime() - minutes * 60 * 1000);
};

const normalizeSameDayTimestamp = (candidate, queueDate) => {
  const parsed = parseDateTime(candidate);
  if (!parsed) {
    return null;
  }

  const shifted = new Date(parsed.getTime() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  const datePart = shifted.toISOString().slice(0, 10);
  return datePart === queueDate ? parsed : null;
};

const inferCheckedInAt = (queue, latestPrediction) => {
  const actualStart = parseDateTime(queue.actual_start);
  const actualEnd = parseDateTime(queue.actual_end);
  const predictionCreatedAt = parseDateTime(latestPrediction?.created_at);
  const latestPredictedWait =
    typeof latestPrediction?.predicted_wait_time === "number" && latestPrediction.predicted_wait_time >= 0
      ? latestPrediction.predicted_wait_time
      : null;
  const queuePredictedWait =
    typeof queue.predicted_wait_minutes === "number" && queue.predicted_wait_minutes >= 0
      ? queue.predicted_wait_minutes
      : null;

  if (actualStart && queuePredictedWait !== null) {
    const inferred = normalizeSameDayTimestamp(subtractMinutes(actualStart, queuePredictedWait), queue.date);
    if (inferred && inferred <= actualStart) {
      return { value: inferred, source: "actual_start_minus_queue_predicted_wait" };
    }
  }

  if (actualStart && latestPredictedWait !== null) {
    const inferred = normalizeSameDayTimestamp(subtractMinutes(actualStart, latestPredictedWait), queue.date);
    if (inferred && inferred <= actualStart) {
      return { value: inferred, source: "actual_start_minus_latest_prediction_wait" };
    }
  }

  if (predictionCreatedAt && actualStart && predictionCreatedAt <= actualStart) {
    const inferred = normalizeSameDayTimestamp(predictionCreatedAt, queue.date);
    if (inferred) {
      return { value: inferred, source: "latest_prediction_created_at" };
    }
  }

  if (!actualStart && !actualEnd && predictionCreatedAt) {
    const inferred = normalizeSameDayTimestamp(predictionCreatedAt, queue.date);
    if (inferred) {
      return { value: inferred, source: "latest_prediction_created_at_without_actuals" };
    }
  }

  if (actualStart && queuePredictedWait === 0) {
    const inferred = normalizeSameDayTimestamp(actualStart, queue.date);
    if (inferred) {
      return { value: inferred, source: "actual_start_immediate_checkin" };
    }
  }

  return null;
};

const main = async () => {
  const queryOptions = {
    where: { checked_in_at: null },
    include: [
      {
        model: WaitPrediction,
        as: "WaitPrediction",
        attributes: ["id", "predicted_wait_time", "created_at"],
        required: false,
      },
    ],
    order: [
      ["date", "ASC"],
      ["queue_number", "ASC"],
      ["id", "ASC"],
    ],
  };

  if (Number.isInteger(limit) && limit > 0) {
    queryOptions.limit = limit;
  }

  const queues = await Queue.findAll(queryOptions);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  console.info(
    `[checked-in backfill] found ${queues.length} queue(s) with checked_in_at = null${isDryRun ? " (dry-run)" : ""}`
  );

  for (const queue of queues) {
    try {
      const inferred = inferCheckedInAt(queue, queue.WaitPrediction);

      if (!inferred) {
        skipped += 1;
        console.info(`[checked-in backfill] skip queue#${queue.id}: could not infer checked_in_at`);
        continue;
      }

      if (!isDryRun) {
        await queue.update({ checked_in_at: inferred.value });
      }

      updated += 1;
      console.info(
        `[checked-in backfill] ${isDryRun ? "would update" : "updated"} queue#${queue.id} -> ${inferred.value.toISOString()} (${inferred.source})`
      );
    } catch (error) {
      failed += 1;
      console.error(`[checked-in backfill] failed queue#${queue.id}: ${error.message}`);
    }
  }

  console.info(
    `[checked-in backfill] done. updated=${updated} skipped=${skipped} failed=${failed}`
  );
};

main()
  .catch((error) => {
    console.error("[checked-in backfill] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
