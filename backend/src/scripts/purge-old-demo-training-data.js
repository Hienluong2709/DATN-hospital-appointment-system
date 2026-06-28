import db from "../models/index.js";
import associateModels from "../models/associations.js";

const { sequelize, Appointment, Queue, WaitPrediction, SmsLog, EQueueNumber } = db;

associateModels(db);

const LEGACY_DEMO_MODEL_VERSION = "demo_training_seed_v1";
const LEGACY_DEMO_PREDICTION_SOURCE = "demo_training_seed";
const isDryRun = process.argv.includes("--dry-run");

const toUniqueSortedNumbers = (values) =>
  Array.from(
    new Set(
      values.filter((value) => Number.isInteger(value) && value > 0),
    ),
  ).sort((left, right) => left - right);

const toUniqueDoctorDateKeys = (queues) =>
  Array.from(
    new Set(
      queues
        .map((queue) => {
          const doctorId = Number(queue.doctor_id);
          const dateValue = queue.date;
          if (!Number.isInteger(doctorId) || !dateValue) {
            return null;
          }

          return `${doctorId}|${dateValue}`;
        })
        .filter(Boolean),
    ),
  );

const main = async () => {
  const legacyQueues = await Queue.findAll({
    include: [
      {
        model: WaitPrediction,
        as: "WaitPrediction",
        attributes: ["id", "model_version", "prediction_source"],
        required: true,
        where: {
          model_version: LEGACY_DEMO_MODEL_VERSION,
          prediction_source: LEGACY_DEMO_PREDICTION_SOURCE,
        },
      },
      {
        model: Appointment,
        attributes: ["id", "reason", "date", "time_slot", "status"],
        required: true,
      },
    ],
    order: [
      ["date", "ASC"],
      ["doctor_id", "ASC"],
      ["queue_number", "ASC"],
      ["id", "ASC"],
    ],
  });

  const queueIds = toUniqueSortedNumbers(legacyQueues.map((queue) => Number(queue.id)));
  const appointmentIds = toUniqueSortedNumbers(
    legacyQueues.map((queue) => Number(queue.appointment_id)),
  );
  const impactedDoctorDates = toUniqueDoctorDateKeys(legacyQueues);

  const summary = {
    dry_run: isDryRun,
    legacy_demo_model_version: LEGACY_DEMO_MODEL_VERSION,
    legacy_demo_prediction_source: LEGACY_DEMO_PREDICTION_SOURCE,
    queues_targeted: queueIds.length,
    appointments_targeted: appointmentIds.length,
    impacted_doctor_dates: impactedDoctorDates.length,
    wait_predictions_removed: 0,
    sms_logs_removed: 0,
    queues_removed: 0,
    appointments_removed: 0,
    equeue_rows_updated: 0,
    equeue_rows_reset_to_zero: 0,
  };

  if (!queueIds.length) {
    console.info("[purge old demo training data] no legacy demo queues found.");
    console.info(JSON.stringify(summary, null, 2));
    return;
  }

  await sequelize.transaction(async (transaction) => {
    const waitPredictionWhere = { queue_id: queueIds };
    const smsLogWhere = {
      queue_id: queueIds,
    };
    const appointmentSmsLogWhere = {
      appointment_id: appointmentIds,
    };

    summary.wait_predictions_removed = await WaitPrediction.count({
      where: waitPredictionWhere,
      transaction,
    });
    summary.sms_logs_removed =
      (await SmsLog.count({ where: smsLogWhere, transaction })) +
      (await SmsLog.count({ where: appointmentSmsLogWhere, transaction }));

    if (isDryRun) {
      return;
    }

    await SmsLog.destroy({
      where: smsLogWhere,
      transaction,
    });
    await SmsLog.destroy({
      where: appointmentSmsLogWhere,
      transaction,
    });

    await WaitPrediction.destroy({
      where: waitPredictionWhere,
      transaction,
    });

    summary.queues_removed = await Queue.destroy({
      where: { id: queueIds },
      transaction,
    });

    summary.appointments_removed = await Appointment.destroy({
      where: { id: appointmentIds },
      transaction,
    });

    for (const doctorDateKey of impactedDoctorDates) {
      const [doctorIdText, dateValue] = doctorDateKey.split("|");
      const doctorId = Number(doctorIdText);
      const currentMaxQueueNumber =
        (await Queue.max("queue_number", {
          where: {
            doctor_id: doctorId,
            date: dateValue,
          },
          transaction,
        })) ?? 0;

      const [equeueRow] = await EQueueNumber.findOrCreate({
        where: {
          doctor_id: doctorId,
          date: dateValue,
        },
        defaults: {
          doctor_id: doctorId,
          date: dateValue,
          current_number: currentMaxQueueNumber,
        },
        transaction,
      });

      if (Number(equeueRow.current_number) !== Number(currentMaxQueueNumber)) {
        await equeueRow.update(
          {
            current_number: currentMaxQueueNumber,
          },
          { transaction },
        );
      }

      summary.equeue_rows_updated += 1;
      if (Number(currentMaxQueueNumber) === 0) {
        summary.equeue_rows_reset_to_zero += 1;
      }
    }
  });

  console.info("[purge old demo training data] completed.");
  console.info(JSON.stringify(summary, null, 2));
};

main()
  .catch((error) => {
    console.error("[purge old demo training data] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
