import db from "../models/index.js";
import associateModels from "../models/associations.js";

const { sequelize, Queue, Appointment, WaitPrediction } = db;

associateModels(db);

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

const toBusinessDateString = (value) => {
  const parsed = parseDateTime(value);
  if (!parsed) {
    return null;
  }

  const shifted = new Date(parsed.getTime() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
};

const diffMinutes = (left, right) => {
  const leftDate = parseDateTime(left);
  const rightDate = parseDateTime(right);

  if (!leftDate || !rightDate) {
    return null;
  }

  return Math.round((rightDate.getTime() - leftDate.getTime()) / 60000);
};

const main = async () => {
  const queues = await Queue.findAll({
    include: [
      {
        model: Appointment,
        attributes: ["id", "status", "date", "time_slot"],
      },
      {
        model: WaitPrediction,
        as: "WaitPrediction",
        attributes: ["id", "predicted_wait_time", "predicted_start", "created_at"],
        required: false,
      },
    ],
    order: [
      ["date", "ASC"],
      ["doctor_id", "ASC"],
      ["queue_number", "ASC"],
      ["id", "ASC"],
    ],
  });

  const issues = [];

  for (const queue of queues) {
    const queueData = typeof queue.toJSON === "function" ? queue.toJSON() : queue;
    const issueCodes = [];

    const actualStartBusinessDate = toBusinessDateString(queueData.actual_start);
    const checkedInBusinessDate = toBusinessDateString(queueData.checked_in_at);
    const predictedStartBusinessDate =
      toBusinessDateString(queueData.estimated_start) || toBusinessDateString(queueData.WaitPrediction?.predicted_start);

    if (queueData.actual_start && actualStartBusinessDate !== queueData.date) {
      issueCodes.push("actual_start_outside_queue_date");
    }

    if (queueData.checked_in_at && checkedInBusinessDate !== queueData.date) {
      issueCodes.push("checked_in_at_outside_queue_date");
    }

    if (queueData.estimated_start && predictedStartBusinessDate !== queueData.date) {
      issueCodes.push("estimated_start_outside_queue_date");
    }

    if (queueData.checked_in_at && queueData.actual_start) {
      const waitMinutes = diffMinutes(queueData.checked_in_at, queueData.actual_start);
      if (waitMinutes !== null && waitMinutes < 0) {
        issueCodes.push("checked_in_after_actual_start");
      }
    }

    if (queueData.Appointment?.status === "Completed" && !queueData.checked_in_at) {
      issueCodes.push("completed_missing_checked_in_at");
    }

    if (queueData.Appointment?.status === "CheckedIn" && !queueData.checked_in_at) {
      issueCodes.push("checked_in_status_missing_checked_in_at");
    }

    if (queueData.checked_in_at && queueData.estimated_start) {
      const waitMinutes = diffMinutes(queueData.checked_in_at, queueData.estimated_start);
      if (waitMinutes !== null && waitMinutes < 0) {
        issueCodes.push("estimated_start_before_checked_in_at");
      }
    }

    if (
      typeof queueData.predicted_wait_minutes === "number" &&
      queueData.checked_in_at &&
      queueData.estimated_start
    ) {
      const derivedWait = diffMinutes(queueData.checked_in_at, queueData.estimated_start);
      if (derivedWait !== null && derivedWait !== queueData.predicted_wait_minutes) {
        issueCodes.push("predicted_wait_not_matching_estimated_start");
      }
    }

    if (queueData.latest_prediction_id && !queueData.WaitPrediction?.id) {
      issueCodes.push("latest_prediction_id_without_joined_prediction");
    }

    if (issueCodes.length > 0) {
      issues.push({
        queue_id: queueData.id,
        appointment_id: queueData.appointment_id,
        doctor_id: queueData.doctor_id,
        date: queueData.date,
        queue_number: queueData.queue_number,
        appointment_status: queueData.Appointment?.status ?? null,
        checked_in_at: queueData.checked_in_at ?? null,
        estimated_start: queueData.estimated_start ?? null,
        actual_start: queueData.actual_start ?? null,
        actual_end: queueData.actual_end ?? null,
        predicted_wait_minutes: queueData.predicted_wait_minutes ?? null,
        latest_prediction_id: queueData.latest_prediction_id ?? null,
        issue_codes: issueCodes,
      });
    }
  }

  const summary = issues.reduce((accumulator, issue) => {
    for (const code of issue.issue_codes) {
      accumulator[code] = (accumulator[code] || 0) + 1;
    }
    return accumulator;
  }, {});

  console.info(JSON.stringify({
    total_queues: queues.length,
    issue_count: issues.length,
    summary,
    issues,
  }, null, 2));
};

main()
  .catch((error) => {
    console.error("[queue audit] fatal:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
