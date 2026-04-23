import db from "../models/index.js";
import associateModels from "../models/associations.js";
import { runQueueNotificationJob } from "../services/queueNotificationJobService.js";

const { sequelize } = db;

associateModels(db);

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
const targetDate = dateArg ? dateArg.split("=")[1] : undefined;

const main = async () => {
  const summary = await runQueueNotificationJob({
    date: targetDate,
    dryRun: isDryRun,
    triggerType: "manual",
  });

  if (summary?.skipped_reason) {
    console.info(
      `[queue notification job] skipped date=${summary.date} reason=${summary.skipped_reason}`
    );
    return;
  }

  console.info(
    `[queue notification job] ${isDryRun ? "dry-run" : "done"} date=${summary.date} candidates=${summary.total_candidates} ready=${summary.queue_ready_created} soon=${summary.queue_soon_created} duplicates=${summary.duplicates}`
  );
};

main()
  .catch((error) => {
    console.error("[queue notification job] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
