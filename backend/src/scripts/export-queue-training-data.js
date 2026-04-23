import fs from "fs";
import path from "path";
import { Op } from "sequelize";

import db from "../models/index.js";
import associateModels from "../models/associations.js";

const { sequelize, Queue, Appointment, Doctor, Specialty, Room, WaitPrediction } = db;

associateModels(db);

const formatArgValue = (prefix) => {
  const matchedArg = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return matchedArg ? matchedArg.slice(prefix.length + 1) : null;
};

const dateFrom = formatArgValue("--date-from");
const dateTo = formatArgValue("--date-to");
const outputPath = formatArgValue("--output");
const format = (formatArgValue("--format") || "json").toLowerCase();

const parseDateTime = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toIsoString = (value) => {
  const parsed = parseDateTime(value);
  return parsed ? parsed.toISOString() : null;
};

const diffMinutes = (start, end) => {
  const left = parseDateTime(start);
  const right = parseDateTime(end);

  if (!left || !right) {
    return null;
  }

  return Math.round((right.getTime() - left.getTime()) / 60000);
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

const main = async () => {
  const where = {};
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) {
      where.date[Op.gte] = dateFrom;
    }
    if (dateTo) {
      where.date[Op.lte] = dateTo;
    }
  }

  const queues = await Queue.findAll({
    where,
    include: [
      {
        model: Appointment,
        attributes: ["id", "patient_id", "doctor_id", "date", "status", "time_slot", "preferred_period", "reason"],
        include: [
          {
            model: Doctor,
            attributes: ["id", "specialty_id", "room_id"],
            include: [
              { model: Specialty, attributes: ["id", "name"] },
              { model: Room, attributes: ["id", "name", "floor"] },
            ],
          },
        ],
      },
      {
        model: WaitPrediction,
        as: "WaitPrediction",
        attributes: ["id", "predicted_wait_time", "predicted_start", "prediction_source", "model_version", "created_at"],
      },
    ],
    order: [
      ["date", "ASC"],
      ["queue_number", "ASC"],
      ["id", "ASC"],
    ],
  });

  const rows = queues.map((queue) => {
    const appointment = queue.Appointment;
    const latestPrediction = queue.WaitPrediction;

    return {
      queue_id: queue.id,
      appointment_id: queue.appointment_id,
      patient_id: appointment?.patient_id ?? null,
      doctor_id: queue.doctor_id,
      specialty_id: appointment?.Doctor?.specialty_id ?? null,
      specialty_name: appointment?.Doctor?.Specialty?.name ?? null,
      room_id: appointment?.Doctor?.room_id ?? null,
      room_name: appointment?.Doctor?.Room?.name ?? null,
      room_floor: appointment?.Doctor?.Room?.floor ?? null,
      appointment_date: queue.date,
      appointment_status: appointment?.status ?? null,
      queue_number: queue.queue_number,
      checked_in_at: toIsoString(queue.checked_in_at),
      original_estimated_start: toIsoString(queue.original_estimated_start),
      estimated_start: toIsoString(queue.estimated_start),
      forecast_updated_at: toIsoString(queue.forecast_updated_at),
      predicted_wait_minutes: queue.predicted_wait_minutes ?? null,
      latest_prediction_id: queue.latest_prediction_id ?? null,
      latest_predicted_wait_time: latestPrediction?.predicted_wait_time ?? null,
      latest_predicted_start: toIsoString(latestPrediction?.predicted_start),
      latest_prediction_source: latestPrediction?.prediction_source ?? null,
      latest_model_version: latestPrediction?.model_version ?? null,
      latest_prediction_created_at: toIsoString(latestPrediction?.created_at),
      actual_start: toIsoString(queue.actual_start),
      actual_end: toIsoString(queue.actual_end),
      visit_duration_minutes: diffMinutes(queue.actual_start, queue.actual_end),
      start_delay_from_original_minutes: diffMinutes(queue.original_estimated_start, queue.actual_start),
      start_delay_from_latest_minutes: diffMinutes(queue.estimated_start, queue.actual_start),
      checkin_to_start_minutes: diffMinutes(queue.checked_in_at, queue.actual_start),
      no_show_flag: appointment?.status === "NoShow" ? 1 : 0,
      completed_flag: appointment?.status === "Completed" ? 1 : 0,
    };
  });

  const content =
    format === "csv"
      ? toCsv(rows)
      : JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            rows,
          },
          null,
          2,
        );

  if (outputPath) {
    const resolvedOutputPath = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    fs.writeFileSync(resolvedOutputPath, content, "utf8");
    console.info(`[training export] wrote ${rows.length} row(s) to ${resolvedOutputPath}`);
    return;
  }

  console.info(content);
};

main()
  .catch((error) => {
    console.error("[training export] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
