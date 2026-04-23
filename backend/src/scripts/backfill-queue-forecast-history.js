import db from "../models/index.js";
import associateModels from "../models/associations.js";
import { getAppointmentByIdService } from "../services/appointmentService.js";

const { sequelize, Queue, Appointment, WaitPrediction } = db;

associateModels(db);

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;

const parseDateTime = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isSameMinute = (left, right) => {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return Math.floor(left.getTime() / 60000) === Math.floor(right.getTime() / 60000);
};

const derivePredictedWaitMinutes = (queue, estimatedStart) => {
  if (typeof queue.predicted_wait_minutes === "number" && queue.predicted_wait_minutes >= 0) {
    return queue.predicted_wait_minutes;
  }

  if (queue.actual_start || queue.actual_end) {
    return 0;
  }

  if (!estimatedStart) {
    return null;
  }

  return Math.max(0, Math.ceil((estimatedStart.getTime() - Date.now()) / (60 * 1000)));
};

const main = async () => {
  const queryOptions = {
    include: [
      {
        model: Appointment,
        attributes: ["id", "status"],
        required: true,
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

  let updatedQueues = 0;
  let updatedPredictions = 0;
  let createdPredictions = 0;
  let skipped = 0;
  let failed = 0;

  console.info(
    `[forecast backfill] found ${queues.length} queue(s)${isDryRun ? " (dry-run)" : ""}`
  );

  for (const queue of queues) {
    try {
      const appointment = await getAppointmentByIdService(queue.appointment_id, null);
      const derivedEstimatedStart =
        parseDateTime(queue.estimated_start) ?? parseDateTime(appointment?.estimated_start);

      if (!derivedEstimatedStart) {
        skipped += 1;
        console.info(
          `[forecast backfill] skip queue#${queue.id}: cannot derive estimated_start`
        );
        continue;
      }

      const existingLatestPrediction = await WaitPrediction.findOne({
        where: { queue_id: queue.id },
        order: [
          ["created_at", "DESC"],
          ["id", "DESC"],
        ],
      });

      const queueUpdates = {};
      if (!parseDateTime(queue.estimated_start)) {
        queueUpdates.estimated_start = derivedEstimatedStart;
      }

      if (!parseDateTime(queue.original_estimated_start)) {
        queueUpdates.original_estimated_start = derivedEstimatedStart;
      }

      if (!parseDateTime(queue.forecast_updated_at)) {
        queueUpdates.forecast_updated_at =
          parseDateTime(queue.checked_in_at) ||
          parseDateTime(queue.actual_start) ||
          parseDateTime(queue.actual_end) ||
          parseDateTime(existingLatestPrediction?.created_at) ||
          new Date();
      }

      const derivedPredictedWait = derivePredictedWaitMinutes(queue, derivedEstimatedStart);
      if (
        (queue.predicted_wait_minutes === null || queue.predicted_wait_minutes === undefined) &&
        typeof derivedPredictedWait === "number"
      ) {
        queueUpdates.predicted_wait_minutes = derivedPredictedWait;
      }

      let latestPredictionId = existingLatestPrediction?.id ?? null;

      if (existingLatestPrediction) {
        const predictionUpdates = {};
        const existingPredictedStart = parseDateTime(existingLatestPrediction.predicted_start);
        const latestPredictionMatchesCurrentSnapshot =
          isSameMinute(existingPredictedStart, derivedEstimatedStart) &&
          existingLatestPrediction.predicted_wait_time === (derivedPredictedWait ?? 0);

        if (!existingPredictedStart) {
          predictionUpdates.predicted_start = derivedEstimatedStart;
        }

        if (
          existingLatestPrediction.predicted_wait_time === null ||
          existingLatestPrediction.predicted_wait_time === undefined
        ) {
          predictionUpdates.predicted_wait_time = derivedPredictedWait ?? 0;
        }

        if (!existingLatestPrediction.model_version) {
          predictionUpdates.model_version = "legacy_backfill";
        }

        if (!existingLatestPrediction.prediction_source) {
          predictionUpdates.prediction_source = "legacy_backfill";
        }

        if (Object.keys(predictionUpdates).length > 0 && latestPredictionMatchesCurrentSnapshot) {
          if (!isDryRun) {
            await existingLatestPrediction.update(predictionUpdates);
          }
          updatedPredictions += 1;
        }

        if (!latestPredictionMatchesCurrentSnapshot) {
          const snapshotPayload = {
            queue_id: queue.id,
            predicted_wait_time: derivedPredictedWait ?? 0,
            predicted_start: derivedEstimatedStart,
            prediction_source: "legacy_backfill_snapshot",
            model_version: "legacy_backfill",
            created_at:
              parseDateTime(queue.forecast_updated_at) ||
              parseDateTime(queue.checked_in_at) ||
              new Date(),
          };

          if (!isDryRun) {
            const snapshotPrediction = await WaitPrediction.create(snapshotPayload);
            latestPredictionId = snapshotPrediction.id;
          }

          createdPredictions += 1;
        }

        if (queue.latest_prediction_id !== latestPredictionId) {
          queueUpdates.latest_prediction_id = latestPredictionId;
        }
      } else {
        const predictionPayload = {
          queue_id: queue.id,
          predicted_wait_time: derivedPredictedWait ?? 0,
          predicted_start: derivedEstimatedStart,
          prediction_source: "legacy_backfill",
          model_version: "legacy_backfill",
          created_at:
            parseDateTime(queue.forecast_updated_at) ||
            parseDateTime(queue.checked_in_at) ||
            new Date(),
        };

        if (!isDryRun) {
          const createdPrediction = await WaitPrediction.create(predictionPayload);
          queueUpdates.latest_prediction_id = createdPrediction.id;
        }
        createdPredictions += 1;
      }

      if (Object.keys(queueUpdates).length > 0) {
        if (!isDryRun) {
          await queue.update(queueUpdates);
        }
        updatedQueues += 1;
      }

      console.info(
        `[forecast backfill] ${isDryRun ? "would update" : "updated"} queue#${queue.id}`
      );
    } catch (error) {
      failed += 1;
      console.error(`[forecast backfill] failed queue#${queue.id}: ${error.message}`);
    }
  }

  console.info(
    `[forecast backfill] done. queues_updated=${updatedQueues} predictions_updated=${updatedPredictions} predictions_created=${createdPredictions} skipped=${skipped} failed=${failed}`
  );
};

main()
  .catch((error) => {
    console.error("[forecast backfill] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
