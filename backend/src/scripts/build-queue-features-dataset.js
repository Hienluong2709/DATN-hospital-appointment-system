import fs from "fs";
import path from "path";

const DEFAULT_INPUT_PATH = path.resolve("./exports/queue-training-data.json");
const DEFAULT_FULL_OUTPUT_PATH = path.resolve("./exports/queue-features.csv");
const DEFAULT_TRAIN_FEATURES_OUTPUT_PATH = path.resolve("./exports/queue-train-x.csv");
const DEFAULT_TRAIN_TARGETS_OUTPUT_PATH = path.resolve("./exports/queue-train-y.csv");
const DEFAULT_METADATA_OUTPUT_PATH = path.resolve("./exports/queue-train-meta.csv");

const formatArgValue = (prefix) => {
  const matchedArg = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return matchedArg ? matchedArg.slice(prefix.length + 1) : null;
};

const inputPath = path.resolve(formatArgValue("--input") || DEFAULT_INPUT_PATH);
const outputFullPath = path.resolve(
  formatArgValue("--output-full") || formatArgValue("--output") || DEFAULT_FULL_OUTPUT_PATH
);
const outputTrainFeaturesPath = path.resolve(
  formatArgValue("--output-train-features") || DEFAULT_TRAIN_FEATURES_OUTPUT_PATH
);
const outputTrainTargetsPath = path.resolve(
  formatArgValue("--output-train-targets") || DEFAULT_TRAIN_TARGETS_OUTPUT_PATH
);
const outputMetadataPath = path.resolve(
  formatArgValue("--output-metadata") || DEFAULT_METADATA_OUTPUT_PATH
);
const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";

const TRAIN_FEATURE_COLUMNS = [
  "doctor_id",
  "specialty_id",
  "room_id",
  "queue_number",
  "doctor_daily_queue_count",
  "queues_ahead_total_count",
  "queues_ahead_checked_in_count",
  "queues_ahead_completed_by_checkin_count",
  "queues_ahead_active_backlog_count",
  "queues_ahead_not_checked_in_count",
  "queues_ahead_in_progress_count",
  "completed_ahead_avg_visit_minutes",
  "completed_ahead_total_visit_minutes",
  "minutes_since_last_completed_ahead",
  "appointment_weekday",
  "appointment_month",
  "appointment_day",
  "checked_in_minute_of_day",
  "original_estimated_start_minute_of_day",
  "latest_predicted_start_minute_of_day",
  "checkin_offset_from_original_estimated_start_minutes",
  "checkin_offset_from_latest_predicted_start_minutes",
  "baseline_predicted_wait_minutes",
];

const TRAIN_TARGET_COLUMNS = [
  "target_actual_wait_minutes",
  "target_start_delay_from_original_minutes",
  "target_start_delay_from_latest_minutes",
];

const TRAIN_METADATA_COLUMNS = [
  "queue_id",
  "appointment_id",
  "appointment_date",
  "queue_predicted_wait_minutes",
  "latest_predicted_wait_time",
  "visit_duration_minutes",
];

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

const diffMinutes = (start, end) => {
  const left = parseDateTime(start);
  const right = parseDateTime(end);

  if (!left || !right) {
    return null;
  }

  return Math.round((right.getTime() - left.getTime()) / 60000);
};

const average = (values) => {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const compareRowsInQueueOrder = (left, right) => {
  const queueNumberDiff = Number(left?.queue_number ?? 0) - Number(right?.queue_number ?? 0);
  if (queueNumberDiff !== 0) {
    return queueNumberDiff;
  }

  return Number(left?.queue_id ?? 0) - Number(right?.queue_id ?? 0);
};

const buildDoctorDateKey = (row) => `${row?.doctor_id ?? "unknown"}::${row?.appointment_date ?? "unknown"}`;

const buildQueueStateByQueueId = (rows) => {
  const groupedRows = new Map();

  rows.forEach((row) => {
    if (row?.queue_id == null) {
      return;
    }

    const key = buildDoctorDateKey(row);
    const existingRows = groupedRows.get(key) || [];
    existingRows.push(row);
    groupedRows.set(key, existingRows);
  });

  const queueStateByQueueId = new Map();

  groupedRows.forEach((groupRows) => {
    const sortedRows = [...groupRows].sort(compareRowsInQueueOrder);

    sortedRows.forEach((row, index) => {
      const currentCheckIn = parseDateTime(row.checked_in_at);
      const priorRows = sortedRows.slice(0, index);

      if (!currentCheckIn) {
        queueStateByQueueId.set(row.queue_id, {
          doctor_daily_queue_count: sortedRows.length,
          queues_ahead_total_count: priorRows.length,
          queues_ahead_checked_in_count: null,
          queues_ahead_completed_by_checkin_count: null,
          queues_ahead_active_backlog_count: null,
          queues_ahead_not_checked_in_count: null,
          queues_ahead_in_progress_count: null,
          completed_ahead_avg_visit_minutes: null,
          completed_ahead_total_visit_minutes: null,
          minutes_since_last_completed_ahead: null,
        });
        return;
      }

      const checkedInAheadRows = priorRows.filter((candidate) => {
        const checkedInAt = parseDateTime(candidate.checked_in_at);
        return checkedInAt && checkedInAt <= currentCheckIn;
      });

      const completedAheadRows = priorRows.filter((candidate) => {
        const actualEnd = parseDateTime(candidate.actual_end);
        return actualEnd && actualEnd <= currentCheckIn;
      });

      const inProgressAheadRows = priorRows.filter((candidate) => {
        const actualStart = parseDateTime(candidate.actual_start);
        const actualEnd = parseDateTime(candidate.actual_end);

        return (
          actualStart &&
          actualStart <= currentCheckIn &&
          (!actualEnd || actualEnd > currentCheckIn)
        );
      });

      const completedAheadDurations = completedAheadRows
        .map((candidate) => diffMinutes(candidate.actual_start, candidate.actual_end))
        .filter((value) => Number.isFinite(value) && value > 0);

      const latestCompletedAhead = completedAheadRows
        .map((candidate) => parseDateTime(candidate.actual_end))
        .filter(Boolean)
        .sort((left, right) => right.getTime() - left.getTime())[0];

      queueStateByQueueId.set(row.queue_id, {
        doctor_daily_queue_count: sortedRows.length,
        queues_ahead_total_count: priorRows.length,
        queues_ahead_checked_in_count: checkedInAheadRows.length,
        queues_ahead_completed_by_checkin_count: completedAheadRows.length,
        queues_ahead_active_backlog_count:
          checkedInAheadRows.length - completedAheadRows.length,
        queues_ahead_not_checked_in_count: priorRows.length - checkedInAheadRows.length,
        queues_ahead_in_progress_count: inProgressAheadRows.length,
        completed_ahead_avg_visit_minutes: average(completedAheadDurations),
        completed_ahead_total_visit_minutes: completedAheadDurations.length
          ? completedAheadDurations.reduce((sum, value) => sum + value, 0)
          : null,
        minutes_since_last_completed_ahead: latestCompletedAhead
          ? diffMinutes(latestCompletedAhead, currentCheckIn)
          : null,
      });
    });
  });

  return queueStateByQueueId;
};

const getMinuteOfDay = (value) => {
  const parsed = parseDateTime(value);
  if (!parsed) {
    return null;
  }

  const shifted = new Date(parsed.getTime() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
};

const getWeekday = (dateValue) => {
  if (!dateValue) {
    return null;
  }

  const parsed = new Date(`${dateValue}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCDay();
};

const getMonth = (dateValue) => {
  if (!dateValue) {
    return null;
  }

  const parsed = new Date(`${dateValue}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCMonth() + 1;
};

const getDayOfMonth = (dateValue) => {
  if (!dateValue) {
    return null;
  }

  const parsed = new Date(`${dateValue}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCDate();
};

const toCsv = (rows) => {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const escapeCell = (value) => {
    if (value === null || value === undefined) {
      return "";
    }

    const serialized = String(value);
    if (/[",\n]/.test(serialized)) {
      return `"${serialized.replace(/"/g, '""')}"`;
    }

    return serialized;
  };

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(",")),
  ].join("\n");
};

const shouldKeepRowForRegression = (row) => {
  return row.no_show_flag !== 1 && row.completed_flag === 1 && row.actual_start && row.checked_in_at;
};

const pickColumns = (row, columns) =>
  columns.reduce((selected, column) => {
    selected[column] = row[column] ?? null;
    return selected;
  }, {});

const ensureParentDir = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

const main = async () => {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Không tìm thấy file input: ${inputPath}`);
  }

  const rawContent = fs.readFileSync(inputPath, "utf8");
  const parsed = JSON.parse(rawContent);
  const sourceRows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : [];
  const queueStateByQueueId = buildQueueStateByQueueId(sourceRows);

  const featureRows = sourceRows
    .filter((row) => shouldKeepRowForRegression(row))
    .map((row) => ({
      ...(queueStateByQueueId.get(row.queue_id) || {}),
      queue_id: row.queue_id ?? null,
      appointment_id: row.appointment_id ?? null,
      appointment_date: row.appointment_date ?? null,
      doctor_id: row.doctor_id ?? null,
      specialty_id: row.specialty_id ?? null,
      room_id: row.room_id ?? null,
      queue_number: row.queue_number ?? null,
      appointment_weekday: getWeekday(row.appointment_date),
      appointment_month: getMonth(row.appointment_date),
      appointment_day: getDayOfMonth(row.appointment_date),
      checked_in_minute_of_day: getMinuteOfDay(row.checked_in_at),
      original_estimated_start_minute_of_day: getMinuteOfDay(row.original_estimated_start),
      latest_predicted_start_minute_of_day: getMinuteOfDay(row.latest_predicted_start),
      checkin_offset_from_original_estimated_start_minutes: diffMinutes(
        row.checked_in_at,
        row.original_estimated_start
      ),
      checkin_offset_from_latest_predicted_start_minutes: diffMinutes(
        row.checked_in_at,
        row.latest_predicted_start
      ),
      baseline_predicted_wait_minutes:
        row.predicted_wait_minutes ?? row.latest_predicted_wait_time ?? null,
      queue_predicted_wait_minutes: row.predicted_wait_minutes ?? null,
      latest_predicted_wait_time: row.latest_predicted_wait_time ?? null,
      visit_duration_minutes: row.visit_duration_minutes ?? null,
      target_actual_wait_minutes: row.checkin_to_start_minutes ?? null,
      target_start_delay_from_original_minutes: row.start_delay_from_original_minutes ?? null,
      target_start_delay_from_latest_minutes: row.start_delay_from_latest_minutes ?? null,
    }));

  const trainFeatureRows = featureRows.map((row) => pickColumns(row, TRAIN_FEATURE_COLUMNS));
  const trainTargetRows = featureRows.map((row) => pickColumns(row, TRAIN_TARGET_COLUMNS));
  const metadataRows = featureRows.map((row) => pickColumns(row, TRAIN_METADATA_COLUMNS));

  [outputFullPath, outputTrainFeaturesPath, outputTrainTargetsPath, outputMetadataPath].forEach(
    ensureParentDir
  );

  fs.writeFileSync(outputFullPath, toCsv(featureRows), "utf8");
  fs.writeFileSync(outputTrainFeaturesPath, toCsv(trainFeatureRows), "utf8");
  fs.writeFileSync(outputTrainTargetsPath, toCsv(trainTargetRows), "utf8");
  fs.writeFileSync(outputMetadataPath, toCsv(metadataRows), "utf8");

  console.info(
    [
      `[feature export] wrote ${featureRows.length} regression row(s) from ${sourceRows.length} source row(s)`,
      `full=${outputFullPath}`,
      `train_features=${outputTrainFeaturesPath}`,
      `train_targets=${outputTrainTargetsPath}`,
      `metadata=${outputMetadataPath}`,
    ].join(" ")
  );
};

main().catch((error) => {
  console.error("[feature export] fatal:", error.message);
  process.exitCode = 1;
});
