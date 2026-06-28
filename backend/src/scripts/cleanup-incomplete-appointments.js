import { Op } from "sequelize";

import db from "../models/index.js";
import associateModels from "../models/associations.js";

const { sequelize, Appointment, Queue } = db;

associateModels(db);

const getArgValue = (flagName) => {
  const target = process.argv.find((item) => item.startsWith(`${flagName}=`));
  if (!target) {
    return null;
  }

  return target.slice(flagName.length + 1);
};

const isDryRun = process.argv.includes("--dry-run");
const today = getArgValue("--today") || "2026-04-18";

const main = async () => {
  const appointments = await Appointment.findAll({
    where: {
      date: {
        [Op.lt]: today,
      },
      status: {
        [Op.in]: ["Confirmed", "CheckedIn"],
      },
    },
    include: [
      {
        model: Queue,
        required: false,
        attributes: ["id"],
      },
    ],
    order: [
      ["date", "ASC"],
      ["doctor_id", "ASC"],
      ["id", "ASC"],
    ],
  });

  const candidates = appointments.filter((appointment) => !appointment.Queue);
  const summary = {
    dry_run: isDryRun,
    today,
    candidates: candidates.map((appointment) => ({
      appointment_id: appointment.id,
      doctor_id: appointment.doctor_id,
      patient_id: appointment.patient_id,
      date: appointment.date,
      status: appointment.status,
    })),
    deleted_count: 0,
  };

  if (!isDryRun && candidates.length > 0) {
    await sequelize.transaction(async (transaction) => {
      for (const appointment of candidates) {
        await appointment.destroy({ transaction });
        summary.deleted_count += 1;
      }
    });
  }

  console.info(JSON.stringify(summary, null, 2));
};

main()
  .catch((error) => {
    console.error("[cleanup incomplete appointments] fatal:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
