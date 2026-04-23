import db from "../models/index.js";
import { getAppointmentByIdService } from "../services/appointmentService.js";
import associateModels from "../models/associations.js";

const { sequelize, Queue, Appointment } = db;

associateModels(db);

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;

const parseEstimatedStart = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const main = async () => {
  const where = { estimated_start: null };
  const queryOptions = {
    where,
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

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  console.info(
    `[queue backfill] found ${queues.length} queue(s) with estimated_start = null${isDryRun ? " (dry-run)" : ""}`
  );

  for (const queue of queues) {
    try {
      const appointment = await getAppointmentByIdService(
        queue.appointment_id,
        null
      );
      const estimatedStart = parseEstimatedStart(appointment?.estimated_start);

      if (!estimatedStart) {
        skipped += 1;
        console.info(
          `[queue backfill] skip queue#${queue.id} appointment#${queue.appointment_id}: no estimated_start could be derived`
        );
        continue;
      }

      if (!isDryRun) {
        await queue.update({ estimated_start: estimatedStart });
      }

      updated += 1;
      console.info(
        `[queue backfill] ${isDryRun ? "would update" : "updated"} queue#${queue.id} appointment#${queue.appointment_id} -> ${appointment.estimated_start}`
      );
    } catch (error) {
      failed += 1;
      console.error(
        `[queue backfill] failed queue#${queue.id} appointment#${queue.appointment_id}: ${error.message}`
      );
    }
  }

  console.info(
    `[queue backfill] done. updated=${updated} skipped=${skipped} failed=${failed}`
  );
};

main()
  .catch((error) => {
    console.error("[queue backfill] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
