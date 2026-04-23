import fs from "fs";
import path from "path";

const DEFAULT_INPUT_PATH = path.resolve("./exports/queue-training-data.json");
const DEFAULT_OUTPUT_PATH = path.resolve("./exports/queue-features.csv");

const formatArgValue = (prefix) => {
  const matchedArg = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return matchedArg ? matchedArg.slice(prefix.length + 1) : null;
};

const inputPath = path.resolve(formatArgValue("--input") || DEFAULT_INPUT_PATH);
const outputPath = path.resolve(formatArgValue("--output") || DEFAULT_OUTPUT_PATH);
const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";

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

const main = async () => {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Không tìm thấy file input: ${inputPath}`);
  }

  const rawContent = fs.readFileSync(inputPath, "utf8");
  const parsed = JSON.parse(rawContent);
  const sourceRows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : [];

  const featureRows = sourceRows
    .filter((row) => shouldKeepRowForRegression(row))
    .map((row) => ({
      queue_id: row.queue_id ?? null,
      appointment_id: row.appointment_id ?? null,
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
      predicted_wait_minutes: row.predicted_wait_minutes ?? row.latest_predicted_wait_time ?? null,
      latest_predicted_wait_time: row.latest_predicted_wait_time ?? null,
      visit_duration_minutes: row.visit_duration_minutes ?? null,
      target_actual_wait_minutes: row.checkin_to_start_minutes ?? null,
      target_start_delay_from_original_minutes: row.start_delay_from_original_minutes ?? null,
      target_start_delay_from_latest_minutes: row.start_delay_from_latest_minutes ?? null,
    }));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, toCsv(featureRows), "utf8");

  console.info(
    `[feature export] wrote ${featureRows.length} regression row(s) to ${outputPath} from ${sourceRows.length} source row(s)`
  );
};

main().catch((error) => {
  console.error("[feature export] fatal:", error.message);
  process.exitCode = 1;
});
