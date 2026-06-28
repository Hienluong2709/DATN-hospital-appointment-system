import db from "../models/index.js";
import associateModels from "../models/associations.js";

const { sequelize, Queue, Appointment, WaitPrediction } = db;

associateModels(db);

const PREDICTION_SOURCE = "manual_legacy_fix";
const MODEL_VERSION = "manual_legacy_fix_v1";

const getArgValue = (flagName) => {
  const target = process.argv.find((item) => item.startsWith(`${flagName}=`));
  if (!target) {
    return null;
  }

  return target.slice(flagName.length + 1);
};

const isDryRun = process.argv.includes("--dry-run");
const selectedQueueIds = (getArgValue("--queue-ids") || "1,2,5,6")
  .split(",")
  .map((item) => Number(item.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);

const FIXTURES = {
  1: {
    type: "delete_cancelled_queue",
  },
  2: {
    type: "normalize_completed_queue",
    checked_in_at: "2026-04-01T01:55:00.000Z",
    actual_start: "2026-04-01T02:00:00.000Z",
    actual_end: "2026-04-01T02:22:00.000Z",
    original_estimated_start: "2026-04-01T02:00:00.000Z",
    estimated_start: "2026-04-01T02:00:00.000Z",
    predicted_wait_minutes: 5,
  },
  5: {
    type: "normalize_completed_queue",
    checked_in_at: "2026-04-03T04:15:51.000Z",
    actual_start: "2026-04-03T04:15:51.000Z",
    actual_end: "2026-04-03T04:37:51.000Z",
    original_estimated_start: "2026-04-03T04:00:00.000Z",
    estimated_start: "2026-04-03T04:15:51.000Z",
    predicted_wait_minutes: 0,
  },
  6: {
    type: "mark_no_show_and_delete_queue",
  },
};

const createPrediction = async (queueId, predictedWaitMinutes, predictedStart, transaction, dryRun) => {
  if (dryRun) {
    return { id: null };
  }

  return WaitPrediction.create(
    {
      queue_id: queueId,
      predicted_wait_time: predictedWaitMinutes,
      predicted_start: predictedStart,
      prediction_source: PREDICTION_SOURCE,
      model_version: MODEL_VERSION,
      created_at: new Date(),
    },
    { transaction },
  );
};

const deleteQueueWithPredictions = async (queue, transaction, dryRun) => {
  const predictionCount = await WaitPrediction.count({
    where: { queue_id: queue.id },
    transaction,
  });

  if (!dryRun) {
    await WaitPrediction.destroy({
      where: { queue_id: queue.id },
      transaction,
    });
    await queue.destroy({ transaction });
  }

  return predictionCount;
};

const main = async () => {
  const summary = {
    dry_run: isDryRun,
    fixed: [],
    skipped: [],
  };

  for (const queueId of selectedQueueIds) {
    const config = FIXTURES[queueId];
    if (!config) {
      summary.skipped.push({
        queue_id: queueId,
        reason: "no_manual_fix_fixture",
      });
      continue;
    }

    await sequelize.transaction(async (transaction) => {
      const queue = await Queue.findByPk(queueId, {
        include: [
          {
            model: Appointment,
            attributes: ["id", "status", "date", "time_slot"],
          },
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!queue) {
        summary.skipped.push({
          queue_id: queueId,
          reason: "queue_not_found",
        });
        return;
      }

      if (config.type === "delete_cancelled_queue") {
        const predictionCount = await deleteQueueWithPredictions(queue, transaction, isDryRun);
        summary.fixed.push({
          queue_id: queue.id,
          appointment_id: queue.appointment_id,
          action: "delete_cancelled_queue",
          wait_predictions_removed: predictionCount,
        });
        return;
      }

      if (config.type === "mark_no_show_and_delete_queue") {
        if (!isDryRun) {
          await queue.Appointment.update(
            {
              status: "NoShow",
            },
            { transaction },
          );
        }

        const predictionCount = await deleteQueueWithPredictions(queue, transaction, isDryRun);
        summary.fixed.push({
          queue_id: queue.id,
          appointment_id: queue.appointment_id,
          action: "mark_no_show_and_delete_queue",
          wait_predictions_removed: predictionCount,
        });
        return;
      }

      if (config.type === "normalize_completed_queue") {
        const predictionCount = await WaitPrediction.count({
          where: { queue_id: queue.id },
          transaction,
        });

        if (!isDryRun) {
          await WaitPrediction.destroy({
            where: { queue_id: queue.id },
            transaction,
          });

          const prediction = await createPrediction(
            queue.id,
            config.predicted_wait_minutes,
            new Date(config.estimated_start),
            transaction,
            isDryRun,
          );

          await queue.update(
            {
              checked_in_at: new Date(config.checked_in_at),
              actual_start: new Date(config.actual_start),
              actual_end: new Date(config.actual_end),
              original_estimated_start: new Date(config.original_estimated_start ?? config.estimated_start),
              estimated_start: new Date(config.estimated_start),
              predicted_wait_minutes: config.predicted_wait_minutes,
              latest_prediction_id: prediction.id,
              forecast_updated_at: new Date(),
            },
            { transaction },
          );
        }

        summary.fixed.push({
          queue_id: queue.id,
          appointment_id: queue.appointment_id,
          action: "normalize_completed_queue",
          removed_stale_predictions: predictionCount,
          checked_in_at: config.checked_in_at,
          actual_start: config.actual_start,
          actual_end: config.actual_end,
          original_estimated_start: config.original_estimated_start ?? config.estimated_start,
          estimated_start: config.estimated_start,
          predicted_wait_minutes: config.predicted_wait_minutes,
        });
      }
    });
  }

  console.info(JSON.stringify(summary, null, 2));
};

main()
  .catch((error) => {
    console.error("[manual legacy queue fix] fatal:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
