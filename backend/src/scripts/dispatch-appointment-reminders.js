import db from "../models/index.js";
import associateModels from "../models/associations.js";
import { runAppointmentReminderJob } from "../services/appointmentReminderJobService.js";

const { sequelize } = db;

associateModels(db);

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
const targetDate = dateArg ? dateArg.split("=")[1] : undefined;

const main = async () => {
  const summary = await runAppointmentReminderJob({
    date: targetDate,
    dryRun: isDryRun,
    triggerType: "manual",
  });

  if (summary?.skipped_reason) {
    console.info(
      `[appointment reminder job] skipped date=${summary.date} reason=${summary.skipped_reason}`,
    );
    return;
  }

  console.info(
    [
      `[appointment reminder job] ${isDryRun ? "dry-run" : "done"}`,
      `date=${summary.date}`,
      `candidates=${summary.total_candidates}`,
      `created=${summary.reminder_created}`,
      `duplicates=${summary.duplicates}`,
      `not_due=${summary.skipped_not_due}`,
      `checked_in=${summary.skipped_checked_in}`,
      `missing_phone=${summary.missing_phone}`,
    ].join(" "),
  );
};

main()
  .catch((error) => {
    console.error("[appointment reminder job] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
