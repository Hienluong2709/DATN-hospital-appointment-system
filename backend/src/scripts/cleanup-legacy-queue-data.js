import db from "../models/index.js";
import associateModels from "../models/associations.js";

const { sequelize, Queue, Appointment, WaitPrediction } = db;

associateModels(db);

const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";
const CLEANUP_PREDICTION_SOURCE = "legacy_cleanup";
const CLEANUP_MODEL_VERSION = "legacy_cleanup_v1";

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

const toBusinessDateString = (value) => {
  const parsed = parseDateTime(value);
  if (!parsed) {
    return null;
  }

  const shifted = new Date(parsed.getTime() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
};

const getCurrentBusinessDate = () => {
  const shifted = new Date(Date.now() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
};

const getArgValue = (flagName) => {
  const target = process.argv.find((item) => item.startsWith(`${flagName}=`));
  if (!target) {
    return null;
  }

  return target.slice(flagName.length + 1);
};

const isDryRun = process.argv.includes("--dry-run");
const targetQueueIds = (getArgValue("--queue-ids") || "")
  .split(",")
  .map((item) => Number(item.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);

const queueWhere = targetQueueIds.length > 0 ? { id: targetQueueIds } : undefined;

const currentBusinessDate = getCurrentBusinessDate();

const destroyQueueRelatedData = async (queue, transaction, summary, reason, dryRun) => {
  const queueData = typeof queue.toJSON === "function" ? queue.toJSON() : queue;
  const destroyedPredictionCount = await WaitPrediction.count({
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

  summary.queue_removed += 1;
  summary.wait_predictions_removed += destroyedPredictionCount;
  summary.actions.push({
    queue_id: queue.id,
    appointment_id: queueData.appointment_id,
    action: reason,
    wait_predictions_removed: destroyedPredictionCount,
  });
};

const createCleanupPrediction = async (queue, predictedWaitMinutes, predictedStart, transaction, dryRun) => {
  if (dryRun) {
    return { id: null };
  }

  return WaitPrediction.create(
    {
      queue_id: queue.id,
      predicted_wait_time: predictedWaitMinutes,
      predicted_start: predictedStart,
      prediction_source: CLEANUP_PREDICTION_SOURCE,
      model_version: CLEANUP_MODEL_VERSION,
      created_at: new Date(),
    },
    { transaction },
  );
};

const main = async () => {
  const summary = {
    dry_run: isDryRun,
    queue_removed: 0,
    wait_predictions_removed: 0,
    appointments_marked_no_show: 0,
    estimates_restored: 0,
    skipped: 0,
    actions: [],
    skipped_items: [],
  };

  const queues = await Queue.findAll({
    where: queueWhere,
    include: [
      {
        model: Appointment,
        attributes: ["id", "status", "date", "time_slot", "preferred_period"],
      },
      {
        model: WaitPrediction,
        as: "WaitPrediction",
        attributes: ["id", "predicted_wait_time", "predicted_start", "created_at"],
        required: false,
      },
    ],
    order: [
      ["date", "ASC"],
      ["doctor_id", "ASC"],
      ["queue_number", "ASC"],
      ["id", "ASC"],
    ],
  });

  for (const queue of queues) {
    await sequelize.transaction(async (transaction) => {
      const lockedQueue = await Queue.findByPk(queue.id, {
        include: [
          {
            model: Appointment,
            attributes: ["id", "status", "date", "time_slot", "preferred_period"],
          },
          {
            model: WaitPrediction,
            as: "WaitPrediction",
            attributes: ["id", "predicted_wait_time", "predicted_start", "created_at"],
            required: false,
          },
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!lockedQueue) {
        return;
      }

      const queueData = typeof lockedQueue.toJSON === "function" ? lockedQueue.toJSON() : lockedQueue;
      const appointmentStatus = queueData.Appointment?.status ?? null;
      const queueDate = queueData.date;
      const estimatedBusinessDate = toBusinessDateString(queueData.estimated_start);
      const originalEstimatedBusinessDate = toBusinessDateString(queueData.original_estimated_start);
      const actualStartBusinessDate = toBusinessDateString(queueData.actual_start);
      const hasActualLifecycle = Boolean(queueData.actual_start || queueData.actual_end);
      const isPastQueueDate = queueDate < currentBusinessDate;
      const shouldDeleteCancelledQueue =
        appointmentStatus === "Cancelled" &&
        !hasActualLifecycle;
      const shouldMarkNoShowAndRemoveQueue =
        isPastQueueDate &&
        (appointmentStatus === "Confirmed" || appointmentStatus === "CheckedIn") &&
        !hasActualLifecycle;
      const canRestoreEstimatedStart =
        queueData.estimated_start &&
        estimatedBusinessDate !== queueDate &&
        queueData.original_estimated_start &&
        originalEstimatedBusinessDate === queueDate;

      if (shouldDeleteCancelledQueue) {
        await destroyQueueRelatedData(
          lockedQueue,
          transaction,
          summary,
          "delete_cancelled_queue_without_actuals",
          isDryRun,
        );
        return;
      }

      if (shouldMarkNoShowAndRemoveQueue) {
        if (!isDryRun) {
          await lockedQueue.Appointment.update(
            {
              status: "NoShow",
            },
            { transaction },
          );
        }

        summary.appointments_marked_no_show += 1;
        summary.actions.push({
          queue_id: lockedQueue.id,
          appointment_id: queueData.appointment_id,
          action: "mark_no_show",
        });

        await destroyQueueRelatedData(
          lockedQueue,
          transaction,
          summary,
          "delete_legacy_past_queue_after_mark_no_show",
          isDryRun,
        );
        return;
      }

      if (canRestoreEstimatedStart) {
        const restoredEstimatedStart = parseDateTime(queueData.original_estimated_start);
        const restoredPredictedWaitMinutes =
          queueData.checked_in_at && restoredEstimatedStart
            ? Math.max(
                0,
                Math.ceil(
                  (restoredEstimatedStart.getTime() - new Date(queueData.checked_in_at).getTime()) /
                    (60 * 1000),
                ),
              )
            : queueData.predicted_wait_minutes;

        if (!isDryRun) {
          const prediction = await createCleanupPrediction(
            lockedQueue,
            restoredPredictedWaitMinutes,
            restoredEstimatedStart,
            transaction,
            isDryRun,
          );

          await lockedQueue.update(
            {
              estimated_start: restoredEstimatedStart,
              predicted_wait_minutes: restoredPredictedWaitMinutes,
              latest_prediction_id: prediction.id ?? lockedQueue.latest_prediction_id,
              forecast_updated_at: new Date(),
            },
            { transaction },
          );
        }

        summary.estimates_restored += 1;
        summary.actions.push({
          queue_id: lockedQueue.id,
          appointment_id: queueData.appointment_id,
          action: "restore_estimated_start_from_original_estimated_start",
          restored_estimated_start: restoredEstimatedStart?.toISOString() ?? null,
          restored_predicted_wait_minutes: restoredPredictedWaitMinutes ?? null,
        });
        return;
      }

      const actualStartMismatch = Boolean(queueData.actual_start && actualStartBusinessDate !== queueDate);
      if (actualStartMismatch) {
        summary.skipped += 1;
        summary.skipped_items.push({
          queue_id: lockedQueue.id,
          appointment_id: queueData.appointment_id,
          reason: "actual_start_mismatch_not_safe_to_repair",
          appointment_status: appointmentStatus,
          date: queueDate,
          actual_start: queueData.actual_start,
        });
        return;
      }

      if (queueData.Appointment?.status === "Completed" && !queueData.checked_in_at) {
        summary.skipped += 1;
        summary.skipped_items.push({
          queue_id: lockedQueue.id,
          appointment_id: queueData.appointment_id,
          reason: "completed_missing_checked_in_at_not_safe_to_infer",
          date: queueDate,
          actual_start: queueData.actual_start,
        });
        return;
      }
    });
  }

  console.info(JSON.stringify(summary, null, 2));
};

main()
  .catch((error) => {
    console.error("[legacy queue cleanup] fatal:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
