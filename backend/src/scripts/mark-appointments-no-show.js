import db from "../models/index.js";
import associateModels from "../models/associations.js";
import { runNoShowJob } from "../services/noShowJobService.js";

const { sequelize } = db;

associateModels(db);

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
const targetDate = dateArg ? dateArg.split("=")[1] : undefined;

const main = async () => {
  const summary = await runNoShowJob({
    date: targetDate,
    dryRun: isDryRun,
    triggerType: "manual",
  });

  if (summary?.skipped_reason === "lock_not_acquired") {
    console.info(
      `[no-show job] skipped date=${summary.date} reason=${summary.skipped_reason}`
    );
    return;
  }

  console.info(
    `[no-show job] ${isDryRun ? "dry-run" : "done"} date=${summary.date} candidates=${summary.total_candidates} marked=${summary.marked_no_show} queues_removed=${summary.queues_removed} skipped_in_progress=${summary.skipped_in_progress}`
  );

  if (summary.appointment_ids.length > 0) {
    console.info(`[no-show job] appointment_ids=${summary.appointment_ids.join(",")}`);
  }
};

main()
  .catch((error) => {
    console.error("[no-show job] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
