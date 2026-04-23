import { spawn } from "child_process";
import path from "path";

const formatArgValue = (prefix) => {
  const matchedArg = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return matchedArg ? matchedArg.slice(prefix.length + 1) : null;
};

const hasFlag = (flag) => process.argv.includes(flag);

const isDryRun = hasFlag("--dry-run");
const limitArg = formatArgValue("--limit");
const dateFrom = formatArgValue("--date-from");
const dateTo = formatArgValue("--date-to");
const outputJson = path.resolve(formatArgValue("--output-json") || "./exports/queue-training-data.json");
const outputFeatures = path.resolve(formatArgValue("--output-features") || "./exports/queue-features.csv");

const runNodeScript = (scriptRelativePath, args = []) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptRelativePath, ...args], {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${scriptRelativePath} exited with code ${code}`));
    });
  });

const main = async () => {
  const sharedBackfillArgs = [];
  if (isDryRun) {
    sharedBackfillArgs.push("--dry-run");
  }
  if (limitArg) {
    sharedBackfillArgs.push(`--limit=${limitArg}`);
  }

  const exportArgs = [`--output=${outputJson}`];
  if (dateFrom) {
    exportArgs.push(`--date-from=${dateFrom}`);
  }
  if (dateTo) {
    exportArgs.push(`--date-to=${dateTo}`);
  }

  const featureArgs = [`--input=${outputJson}`, `--output=${outputFeatures}`];

  console.info("[training pipeline] step 1/4: backfill queue forecast history");
  await runNodeScript("./src/scripts/backfill-queue-forecast-history.js", sharedBackfillArgs);

  console.info("[training pipeline] step 2/4: backfill queue checked_in_at");
  await runNodeScript("./src/scripts/backfill-queue-checked-in-at.js", sharedBackfillArgs);

  console.info("[training pipeline] step 3/4: export queue training data");
  await runNodeScript("./src/scripts/export-queue-training-data.js", exportArgs);

  console.info("[training pipeline] step 4/4: build queue features dataset");
  await runNodeScript("./src/scripts/build-queue-features-dataset.js", featureArgs);

  console.info(
    `[training pipeline] done. json=${outputJson} features=${outputFeatures}${isDryRun ? " (backfill dry-run)" : ""}`
  );
};

main().catch((error) => {
  console.error("[training pipeline] fatal:", error.message);
  process.exitCode = 1;
});
