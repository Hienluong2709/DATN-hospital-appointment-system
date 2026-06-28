import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const formatArgValue = (prefix) => {
  const matchedArg = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return matchedArg ? matchedArg.slice(prefix.length + 1) : null;
};

const hasFlag = (flag) => process.argv.includes(flag);

const isDryRun = hasFlag("--dry-run");
const limitArg = formatArgValue("--limit");
const dateFrom = formatArgValue("--date-from");
const dateTo = formatArgValue("--date-to");

const outputDir = path.resolve(
  formatArgValue("--output-dir") || "./exports/ai-engine"
);
const rawJsonPath = path.join(outputDir, "queue-training-data.json");
const featuresFullPath = path.join(outputDir, "queue-features.csv");
const trainXPath = path.join(outputDir, "queue-train-x.csv");
const trainYPath = path.join(outputDir, "queue-train-y.csv");
const metadataPath = path.join(outputDir, "queue-train-meta.csv");
const manifestPath = path.join(outputDir, "manifest.json");

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

const countCsvRows = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  const content = fs.readFileSync(filePath, "utf8").trim();
  if (!content) {
    return 0;
  }

  const lines = content.split(/\r?\n/);
  return Math.max(0, lines.length - 1);
};

const readCsvHeaders = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const firstLine = fs.readFileSync(filePath, "utf8").split(/\r?\n/, 1)[0]?.trim();
  return firstLine ? firstLine.split(",") : [];
};

const readRawJsonRows = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (Array.isArray(parsed)) {
    return parsed.length;
  }

  if (Array.isArray(parsed?.rows)) {
    return parsed.rows.length;
  }

  return 0;
};

const writeManifest = () => {
  const manifest = {
    generated_at: new Date().toISOString(),
    pipeline: "ai-engine-training-export",
    source: {
      raw_json: rawJsonPath,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      limit: limitArg ? Number(limitArg) : null,
    },
    outputs: {
      queue_training_data_json: rawJsonPath,
      queue_features_csv: featuresFullPath,
      queue_train_x_csv: trainXPath,
      queue_train_y_csv: trainYPath,
      queue_train_meta_csv: metadataPath,
    },
    summary: {
      raw_rows: readRawJsonRows(rawJsonPath),
      train_rows: countCsvRows(trainXPath),
      feature_count: readCsvHeaders(trainXPath).length,
      target_count: readCsvHeaders(trainYPath).length,
      feature_columns: readCsvHeaders(trainXPath),
      target_columns: readCsvHeaders(trainYPath),
    },
    model_contract: {
      primary_model: "CatBoostRegressor",
      baseline_model: "Rule-based Engine",
      benchmark_models: ["Linear Regression", "Random Forest Regressor", "Neural Network/MLP"],
      target_column: "target_actual_wait_minutes",
      output_column: "predicted_wait_minutes",
      estimated_start_formula:
        "estimated_start_time = checked_in_time + predicted_wait_minutes",
      evaluation_metrics: ["MAE", "RMSE", "R2"],
    },
  };

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
};

const main = async () => {
  fs.mkdirSync(outputDir, { recursive: true });

  const sharedBackfillArgs = [];
  if (isDryRun) {
    sharedBackfillArgs.push("--dry-run");
  }
  if (limitArg) {
    sharedBackfillArgs.push(`--limit=${limitArg}`);
  }

  const exportArgs = [`--output=${rawJsonPath}`];
  if (dateFrom) {
    exportArgs.push(`--date-from=${dateFrom}`);
  }
  if (dateTo) {
    exportArgs.push(`--date-to=${dateTo}`);
  }

  const featureArgs = [
    `--input=${rawJsonPath}`,
    `--output=${featuresFullPath}`,
    `--output-train-features=${trainXPath}`,
    `--output-train-targets=${trainYPath}`,
    `--output-metadata=${metadataPath}`,
  ];

  console.info("[ai-engine export] step 1/4: backfill queue forecast history");
  await runNodeScript("./src/scripts/backfill-queue-forecast-history.js", sharedBackfillArgs);

  console.info("[ai-engine export] step 2/4: backfill queue checked_in_at");
  await runNodeScript("./src/scripts/backfill-queue-checked-in-at.js", sharedBackfillArgs);

  console.info("[ai-engine export] step 3/4: export raw queue training data");
  await runNodeScript("./src/scripts/export-queue-training-data.js", exportArgs);

  console.info("[ai-engine export] step 4/4: build clean feature dataset");
  await runNodeScript("./src/scripts/build-queue-features-dataset.js", featureArgs);

  writeManifest();

  console.info(
    [
      "[ai-engine export] done.",
      `output_dir=${outputDir}`,
      `raw_json=${rawJsonPath}`,
      `train_x=${trainXPath}`,
      `train_y=${trainYPath}`,
      `metadata=${metadataPath}`,
      `manifest=${manifestPath}${isDryRun ? " (backfill dry-run)" : ""}`,
    ].join(" ")
  );
};

main().catch((error) => {
  console.error("[ai-engine export] fatal:", error.message);
  process.exitCode = 1;
});
