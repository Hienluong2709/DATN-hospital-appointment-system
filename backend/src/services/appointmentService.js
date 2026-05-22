import { Op, Transaction, UniqueConstraintError } from "sequelize";
import db from "../models/index.js";
import {
  compareQueuesByServiceOrder,
  recalculateQueueForecastForDoctorDateService,
  simulateEstimatedStartForAppointmentService,
} from "./queueForecastService.js";
import {
  buildPaginationMeta,
  createPaginatedListResult,
  createListResult,
  filterItemsByLooseSearch,
  normalizeOptionalQueryString,
  parsePaginationQuery,
} from "../utils/queryUtils.js";

const { Appointment, User, Doctor, Specialty, Room, WorkSchedule, WorkScheduleBlock, Queue, WaitPrediction, SmsLog } = db;
const RETRYABLE_TRANSACTION_ERROR_CODES = new Set(["1213", "1205", "40P01"]);
const normalizeNonNegativeIntegerEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
};
const MAX_TRANSACTION_RETRIES = Number(process.env.MAX_TRANSACTION_RETRIES) || 2;
const DEFAULT_APPOINTMENT_HOLD_MINUTES = Number(process.env.APPOINTMENT_HOLD_MINUTES) || 5;
const DEFAULT_APPOINTMENT_SLOT_MINUTES = Number(process.env.APPOINTMENT_SLOT_MINUTES) || 30;
const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";
const PATIENT_MIN_BOOKING_DAYS_IN_ADVANCE = normalizeNonNegativeIntegerEnv(
  process.env.PATIENT_MIN_BOOKING_DAYS_IN_ADVANCE,
  1,
);
const DOCTOR_SLOT_UNIQUE_INDEX = "uq_appointments_active_doctor_slot";
const PATIENT_SLOT_UNIQUE_INDEX = "uq_appointments_active_patient_slot";
const APPOINTMENT_STATUS = Object.freeze({
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "CheckedIn",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "NoShow",
});
const ACTIVE_DUPLICATE_GUARD_STATUSES = [
  APPOINTMENT_STATUS.PENDING,
  APPOINTMENT_STATUS.CONFIRMED,
  APPOINTMENT_STATUS.CHECKED_IN,
];
const APPOINTMENT_PREFERRED_PERIOD = Object.freeze({
  MORNING: "MORNING",
  AFTERNOON: "AFTERNOON",
});
const AFTERNOON_START_SECONDS = 12 * 3600;
const STATUS_TRANSITIONS = Object.freeze({
  [APPOINTMENT_STATUS.PENDING]: new Set([
    APPOINTMENT_STATUS.CONFIRMED,
    APPOINTMENT_STATUS.CANCELLED,
  ]),
  [APPOINTMENT_STATUS.CONFIRMED]: new Set([
    APPOINTMENT_STATUS.CHECKED_IN,
    APPOINTMENT_STATUS.COMPLETED,
    APPOINTMENT_STATUS.CANCELLED,
    APPOINTMENT_STATUS.NO_SHOW,
  ]),
  [APPOINTMENT_STATUS.CHECKED_IN]: new Set([
    APPOINTMENT_STATUS.COMPLETED,
    APPOINTMENT_STATUS.CANCELLED,
    APPOINTMENT_STATUS.NO_SHOW,
  ]),
  [APPOINTMENT_STATUS.CANCELLED]: new Set(),
  [APPOINTMENT_STATUS.COMPLETED]: new Set(),
  [APPOINTMENT_STATUS.NO_SHOW]: new Set(),
});

const parseDateParts = (dateValue) => {
  const [year, month, day] = dateValue.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() + 1 !== month ||
    parsedDate.getUTCDate() !== day
  ) {
    const error = new Error("date không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return { year, month, day };
};

const parseId = (id) => {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error("ID không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  return parsed;
};

const parseUtcOffsetToMinutes = (offsetValue) => {
  const matched = /^([+-])(\d{2}):(\d{2})$/.exec(offsetValue);
  if (!matched) {
    const error = new Error("BUSINESS_TIMEZONE_OFFSET không hợp lệ, định dạng yêu cầu +/-HH:mm");
    error.statusCode = 500;
    throw error;
  }

  const sign = matched[1] === "+" ? 1 : -1;
  const hours = Number(matched[2]);
  const minutes = Number(matched[3]);

  if (hours > 14 || minutes > 59) {
    const error = new Error("BUSINESS_TIMEZONE_OFFSET không hợp lệ, giá trị giờ/phút vượt ngưỡng");
    error.statusCode = 500;
    throw error;
  }

  return sign * (hours * 60 + minutes);
};

const BUSINESS_TIMEZONE_OFFSET_MINUTES = parseUtcOffsetToMinutes(BUSINESS_TIMEZONE_OFFSET);

const formatDateAtOffset = (dateValue, offsetMinutes) => {
  const shifted = new Date(dateValue.getTime() + offsetMinutes * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getTodayBusinessDateString = () => {
  return formatDateAtOffset(new Date(), BUSINESS_TIMEZONE_OFFSET_MINUTES);
};

const getCurrentBusinessSeconds = () => {
  const shifted = new Date(Date.now() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  return shifted.getUTCHours() * 3600 + shifted.getUTCMinutes() * 60 + shifted.getUTCSeconds();
};

const formatDateTimeAtBusinessOffset = (dateValue) => {
  if (!dateValue) {
    return null;
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const shifted = new Date(date.getTime() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  const seconds = String(shifted.getUTCSeconds()).padStart(2, "0");
  const milliseconds = String(shifted.getUTCMilliseconds()).padStart(3, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${BUSINESS_TIMEZONE_OFFSET}`;
};

const serializeQueueDateTimes = (queueRow) => {
  const data = typeof queueRow?.toJSON === "function" ? queueRow.toJSON() : queueRow;
  if (!data) {
    return data;
  }

  return {
    ...data,
    checked_in_at: formatDateTimeAtBusinessOffset(data.checked_in_at),
    actual_start: formatDateTimeAtBusinessOffset(data.actual_start),
    actual_end: formatDateTimeAtBusinessOffset(data.actual_end),
    estimated_start: formatDateTimeAtBusinessOffset(data.estimated_start),
  };
};

const serializeAppointment = (appointmentRow) => {
  const data = typeof appointmentRow?.toJSON === "function" ? appointmentRow.toJSON() : appointmentRow;
  if (!data) {
    return data;
  }

  const serializedQueue = serializeQueueDateTimes(data.Queue);
  const estimatedStart =
    serializedQueue?.estimated_start ||
    (data.time_slot ? formatDateTimeAtBusinessOffset(parseAppointmentDateTimeLocal(data.date, data.time_slot)) : null);

  return {
    ...data,
    Queue: serializedQueue,
    estimated_start: data.estimated_start ?? estimatedStart ?? null,
  };
};

const normalizeDate = (value) => {
  if (typeof value !== "string") {
    const error = new Error("date là bắt buộc");
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const error = new Error("date không hợp lệ, định dạng YYYY-MM-DD");
    error.statusCode = 400;
    throw error;
  }

  parseDateParts(trimmed);

  if (trimmed < getTodayBusinessDateString()) {
    const error = new Error("Không thể đặt lịch cho ngày trong quá khứ");
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

const normalizeOptionalFilterDate = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    const error = new Error(`${fieldName} không hợp lệ`);
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const error = new Error(`${fieldName} không hợp lệ`);
    error.statusCode = 400;
    throw error;
  }

  parseDateParts(trimmed);
  return trimmed;
};

const normalizeOptionalAppointmentStatusFilter = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    const error = new Error("status không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  if (!Object.values(APPOINTMENT_STATUS).includes(value)) {
    const error = new Error("status không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return value;
};

const normalizeTime = (value) => {
  if (typeof value !== "string") {
    const error = new Error("time_slot là bắt buộc");
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  const matched = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(trimmed);
  if (!matched) {
    const error = new Error("time_slot không hợp lệ, định dạng HH:mm hoặc HH:mm:ss");
    error.statusCode = 400;
    throw error;
  }

  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
};

const normalizeOptionalTime = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return normalizeTime(value);
};

const normalizePreferredPeriod = (value, required = false) => {
  if (value === undefined || value === null || value === "") {
    if (required) {
      const error = new Error("preferred_period là bắt buộc");
      error.statusCode = 400;
      throw error;
    }

    return null;
  }

  const trimmed = String(value).trim().toUpperCase();
  if (
    trimmed !== APPOINTMENT_PREFERRED_PERIOD.MORNING &&
    trimmed !== APPOINTMENT_PREFERRED_PERIOD.AFTERNOON
  ) {
    const error = new Error("preferred_period không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

const normalizeReason = (reason) => {
  if (reason === undefined || reason === null) {
    return null;
  }

  if (typeof reason !== "string") {
    const error = new Error("reason không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  const trimmed = reason.trim();
  return trimmed || null;
};

const normalizeJobDate = (value) => {
  if (typeof value !== "string") {
    const error = new Error("date là bắt buộc");
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const error = new Error("date không hợp lệ, định dạng YYYY-MM-DD");
    error.statusCode = 400;
    throw error;
  }

  parseDateParts(trimmed);
  return trimmed;
};

const ensureCanConfirmAppointment = (appointment, currentUser) => {
  if (currentUser?.role === "PATIENT" && appointment.patient_id !== currentUser.id) {
    const error = new Error("Bạn không có quyền xác nhận lịch hẹn này");
    error.statusCode = 403;
    throw error;
  }
};

const ensureCanCancelAppointment = (appointment, currentUser) => {
  if (currentUser?.role === "PATIENT" && appointment.patient_id !== currentUser.id) {
    const error = new Error("Bạn không có quyền hủy lịch hẹn này");
    error.statusCode = 403;
    throw error;
  }

  if (currentUser?.role === "DOCTOR" && appointment.status !== APPOINTMENT_STATUS.CHECKED_IN) {
    const error = new Error("Bác sĩ chỉ được hủy lượt khám đã check-in");
    error.statusCode = 403;
    throw error;
  }
};

const ensureCanTransitionStatus = (fromStatus, toStatus) => {
  const allowedTransitions = STATUS_TRANSITIONS[fromStatus] || new Set();
  if (!allowedTransitions.has(toStatus)) {
    const error = new Error(`Không thể chuyển trạng thái từ ${fromStatus} sang ${toStatus}`);
    error.statusCode = 409;
    throw error;
  }
};

const normalizeOptionalDateTime = (value, fieldName, defaultValue = null) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${fieldName} không hợp lệ`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

const normalizeSlotMinutes = (value) => {
  if (value === undefined || value === null || value === "") {
    return 30;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 180) {
    const error = new Error("slot_minutes phải là số nguyên trong khoảng 1 đến 180");
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

const parseDateOnlyToUTC = (dateValue) => {
  const { year, month, day } = parseDateParts(dateValue);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateUTC = (dateValue) => {
  return dateValue.toISOString().slice(0, 10);
};

const addDaysUTC = (dateValue, days) => {
  const next = new Date(dateValue);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const getMinimumPatientBookingDateString = () => {
  return formatDateUTC(
    addDaysUTC(
      parseDateOnlyToUTC(getTodayBusinessDateString()),
      PATIENT_MIN_BOOKING_DAYS_IN_ADVANCE,
    )
  );
};

const ensurePatientBookingDateAllowed = (date) => {
  if (PATIENT_MIN_BOOKING_DAYS_IN_ADVANCE <= 0) {
    return;
  }

  const minimumDate = getMinimumPatientBookingDateString();
  if (date < minimumDate) {
    const error = new Error(
      PATIENT_MIN_BOOKING_DAYS_IN_ADVANCE === 1
        ? "Bệnh nhân chỉ có thể đặt lịch sớm nhất từ ngày mai"
        : `Bệnh nhân chỉ có thể đặt lịch trước tối thiểu ${PATIENT_MIN_BOOKING_DAYS_IN_ADVANCE} ngày`
    );
    error.statusCode = 409;
    throw error;
  }
};

const timeToSeconds = (timeValue) => {
  const [hours, minutes, seconds] = timeValue.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};

const secondsToTime = (secondsValue) => {
  const hours = String(Math.floor(secondsValue / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((secondsValue % 3600) / 60)).padStart(2, "0");
  const seconds = String(secondsValue % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

const toTimeString = (value) => String(value).slice(0, 8);

const getPreferredPeriodForTime = (timeValue) => {
  return timeToSeconds(timeValue) < AFTERNOON_START_SECONDS
    ? APPOINTMENT_PREFERRED_PERIOD.MORNING
    : APPOINTMENT_PREFERRED_PERIOD.AFTERNOON;
};

const isSlotWithinPreferredPeriod = (slotTime, preferredPeriod) => {
  if (!preferredPeriod) {
    return true;
  }

  return getPreferredPeriodForTime(slotTime) === preferredPeriod;
};

const filterSlotsByPreferredPeriod = (slots, preferredPeriod) => {
  if (!preferredPeriod) {
    return slots;
  }

  return slots.filter((slot) => isSlotWithinPreferredPeriod(slot, preferredPeriod));
};

const isRetryableTransactionError = (error) => {
  const errorCode = String(error?.original?.code || error?.parent?.code || "");
  return RETRYABLE_TRANSACTION_ERROR_CODES.has(errorCode);
};

const runReadCommittedTransaction = async (callback) => {
  for (let attempt = 0; attempt <= MAX_TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await db.sequelize.transaction(
        { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
        callback
      );
    } catch (error) {
      if (isRetryableTransactionError(error) && attempt < MAX_TRANSACTION_RETRIES) {
        continue;
      }

      if (isRetryableTransactionError(error)) {
        const retryError = new Error("Dữ liệu lịch hẹn đang được cập nhật đồng thời, vui lòng thử lại");
        retryError.statusCode = 409;
        throw retryError;
      }

      throw error;
    }
  }
};

const isUniqueConstraintViolation = (error) => {
  return error instanceof UniqueConstraintError || error?.name === "SequelizeUniqueConstraintError";
};

const toConflictErrorFromUniqueConstraint = (error) => {
  const constraintName = String(error?.original?.constraint || error?.parent?.constraint || "");
  const fields = Object.keys(error?.fields || {});

  const isDoctorSlotConflict =
    constraintName === DOCTOR_SLOT_UNIQUE_INDEX ||
    (fields.includes("doctor_id") && fields.includes("date") && fields.includes("time_slot"));

  if (isDoctorSlotConflict) {
    const conflictError = new Error("Bác sĩ đã có lịch hẹn ở khung giờ này");
    conflictError.statusCode = 409;
    return conflictError;
  }

  const isPatientSlotConflict =
    constraintName === PATIENT_SLOT_UNIQUE_INDEX ||
    (fields.includes("patient_id") && fields.includes("date") && fields.includes("time_slot"));

  if (isPatientSlotConflict) {
    const conflictError = new Error("Bệnh nhân đã có lịch hẹn ở khung giờ này");
    conflictError.statusCode = 409;
    return conflictError;
  }

  const fallbackError = new Error("Khung giờ đã được đặt, vui lòng chọn thời gian khác");
  fallbackError.statusCode = 409;
  return fallbackError;
};

const executeWithUniqueConstraintHandling = async (callback) => {
  try {
    return await callback();
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw toConflictErrorFromUniqueConstraint(error);
    }

    throw error;
  }
};

const ensureNoActiveDuplicateAppointment = async (
  patientId,
  doctorId,
  date,
  transaction,
  options = {},
) => {
  const where = {
    patient_id: patientId,
    doctor_id: doctorId,
    date,
    status: {
      [Op.in]: ACTIVE_DUPLICATE_GUARD_STATUSES,
    },
  };

  if (options.excludeAppointmentId) {
    where.id = { [Op.ne]: options.excludeAppointmentId };
  }

  const existingAppointment = await Appointment.findOne({
    where,
    attributes: ["id", "status"],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });

  if (existingAppointment) {
    const error = new Error("Bệnh nhân đã có lịch hẹn còn hiệu lực với bác sĩ này trong ngày đã chọn");
    error.statusCode = 409;
    throw error;
  }
};

const getPendingHoldExpiry = () => {
  return new Date(Date.now() + DEFAULT_APPOINTMENT_HOLD_MINUTES * 60 * 1000);
};

const cleanupExpiredPendingAppointments = async (transaction) => {
  const [affectedRows] = await Appointment.update(
    {
      status: APPOINTMENT_STATUS.CANCELLED,
      hold_expires_at: null,
    },
    {
      where: {
        status: APPOINTMENT_STATUS.PENDING,
        hold_expires_at: {
          [Op.lte]: new Date(),
        },
      },
      transaction,
    }
  );

  return affectedRows;
};

export const cleanupExpiredPendingAppointmentsService = async () => {
  return cleanupExpiredPendingAppointments();
};

export const markAppointmentsAsNoShowForDateService = async (dateValue, options = {}) => {
  const targetDate = normalizeJobDate(dateValue || getTodayBusinessDateString());
  const isDryRun = Boolean(options?.dryRun);

  const buildSummary = (appointments) => {
    const candidates = [];
    let skippedInProgress = 0;

    for (const appointment of appointments) {
      const queue = appointment.Queue ?? null;

      if (queue?.actual_start || queue?.actual_end) {
        skippedInProgress += 1;
        continue;
      }

      candidates.push({
        appointmentId: appointment.id,
        doctorId: appointment.doctor_id,
        date: appointment.date,
        queueId: queue?.id ?? null,
      });
    }

    return {
      candidates,
      skippedInProgress,
    };
  };

  const loadCandidates = (transaction) =>
    Appointment.findAll({
      where: {
        date: targetDate,
        status: {
          [Op.in]: [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.CHECKED_IN],
        },
      },
      include: [
        {
          model: Queue,
          attributes: ["id", "doctor_id", "date", "actual_start", "actual_end"],
          required: false,
        },
      ],
      order: [
        ["doctor_id", "ASC"],
        ["id", "ASC"],
      ],
      transaction,
      lock: transaction?.LOCK?.UPDATE,
    });

  if (isDryRun) {
    const appointments = await loadCandidates(null);
    const { candidates, skippedInProgress } = buildSummary(appointments);

    return {
      date: targetDate,
      dry_run: true,
      total_candidates: appointments.length,
      marked_no_show: candidates.length,
      queues_removed: 0,
      queues_retained: candidates.filter((item) => !!item.queueId).length,
      skipped_in_progress: skippedInProgress,
      appointment_ids: candidates.map((item) => item.appointmentId),
    };
  }

  return runReadCommittedTransaction(async (transaction) => {
    await cleanupExpiredPendingAppointments(transaction);

    const appointments = await loadCandidates(transaction);
    const { candidates, skippedInProgress } = buildSummary(appointments);
    const recalcTargets = new Map();

    for (const candidate of candidates) {
      if (candidate.queueId) {
        await WaitPrediction.destroy({
          where: { queue_id: candidate.queueId },
          transaction,
        });

        recalcTargets.set(`${candidate.doctorId}:${candidate.date}`, {
          doctorId: candidate.doctorId,
          date: candidate.date,
        });
      }

      await Appointment.update(
        {
          status: APPOINTMENT_STATUS.NO_SHOW,
          hold_expires_at: null,
        },
        {
          where: { id: candidate.appointmentId },
          transaction,
        }
      );
    }

    for (const target of recalcTargets.values()) {
      await recalculateQueueForecastForDoctorDateService(target.doctorId, target.date, transaction);
    }

    return {
      date: targetDate,
      dry_run: false,
      total_candidates: appointments.length,
      marked_no_show: candidates.length,
      queues_removed: 0,
      queues_retained: candidates.filter((item) => !!item.queueId).length,
      skipped_in_progress: skippedInProgress,
      appointment_ids: candidates.map((item) => item.appointmentId),
    };
  });
};

const doesTimeRangeOverlap = (startA, endA, startB, endB) => {
  return startA < endB && endA > startB;
};

const isSlotBlockedByRange = (slotTime, slotMinutes, blockRanges) => {
  if (blockRanges.length === 0) {
    return false;
  }

  const slotStart = timeToSeconds(slotTime);
  const slotEnd = slotStart + slotMinutes * 60;

  return blockRanges.some((block) =>
    doesTimeRangeOverlap(slotStart, slotEnd, block.startSeconds, block.endSeconds)
  );
};

const buildTimeSlots = (startTime, endTime, slotMinutes) => {
  const step = slotMinutes * 60;
  const startSeconds = timeToSeconds(startTime);
  const endSeconds = timeToSeconds(endTime);
  const slots = [];

  for (let cursor = startSeconds; cursor + step <= endSeconds; cursor += step) {
    slots.push(secondsToTime(cursor));
  }

  return slots;
};

const filterPastSlotsForDate = (slots, date, slotMinutes) => {
  if (date !== getTodayBusinessDateString()) {
    return slots;
  }

  const currentBusinessSeconds = getCurrentBusinessSeconds();
  return slots.filter((slot) => timeToSeconds(slot) + slotMinutes * 60 > currentBusinessSeconds);
};

const getDayOfWeekFromDate = (dateValue) => {
  const { year, month, day } = parseDateParts(dateValue);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const parseAppointmentDateTimeLocal = (dateValue, timeValue) => {
  const dateString = String(dateValue).slice(0, 10);
  const rawTimeString = toTimeString(timeValue);
  const timeString = /^\d{2}:\d{2}:\d{2}$/.test(rawTimeString) ? rawTimeString : "23:59:59";
  const { year, month, day } = parseDateParts(dateString);
  const [hour, minute, second] = timeString.split(":").map(Number);

  const utcTimestamp =
    Date.UTC(year, month - 1, day, hour, minute, second) -
    BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000;

  return new Date(utcTimestamp);
};

const ensureCanCancelBy24HourRule = (appointment) => {
  let appointmentDateTime = null;

  if (appointment?.estimated_start) {
    const estimatedDateTime = new Date(appointment.estimated_start);
    if (!Number.isNaN(estimatedDateTime.getTime())) {
      appointmentDateTime = estimatedDateTime;
    }
  }

  if (!appointmentDateTime && appointment?.time_slot) {
    appointmentDateTime = parseAppointmentDateTimeLocal(appointment.date, appointment.time_slot);
  }

  if (!appointmentDateTime) {
    appointmentDateTime = parseAppointmentDateTimeLocal(appointment.date, "23:59:59");
  }

  const minimumCancelLeadTimeMs = 24 * 60 * 60 * 1000;

  if (appointmentDateTime.getTime() - Date.now() < minimumCancelLeadTimeMs) {
    const error = new Error("Chỉ được hủy lịch hẹn trước ít nhất 24 giờ");
    error.statusCode = 409;
    throw error;
  }
};

const ensureAppointmentNotInPastForUpdate = (dateValue, timeValue) => {
  const appointmentDateTime = parseAppointmentDateTimeLocal(dateValue, timeValue);

  if (appointmentDateTime.getTime() < Date.now()) {
    const error = new Error("Không thể cập nhật lịch hẹn trong quá khứ");
    error.statusCode = 409;
    throw error;
  }
};

const ensurePatientExists = async (patientId, transaction) => {
  const parsedPatientId = parseId(patientId);
  const patient = await User.findByPk(parsedPatientId, {
    transaction,
  });

  if (!patient) {
    const error = new Error("Không tìm thấy bệnh nhân");
    error.statusCode = 404;
    throw error;
  }

  if (patient.role !== "PATIENT") {
    const error = new Error("Người dùng không có vai trò bệnh nhân");
    error.statusCode = 400;
    throw error;
  }

  return parsedPatientId;
};

const ensureDoctorExists = async (doctorId, transaction) => {
  const parsedDoctorId = parseId(doctorId);
  const doctor = await Doctor.findByPk(parsedDoctorId, {
    transaction,
  });

  if (!doctor) {
    const error = new Error("Không tìm thấy bác sĩ");
    error.statusCode = 404;
    throw error;
  }

  if (doctor.status !== "Active") {
    const error = new Error("Bác sĩ hiện không hoạt động");
    error.statusCode = 400;
    throw error;
  }

  return parsedDoctorId;
};

const ensureDoctorOwnsAppointment = async (appointment, currentUser, transaction) => {
  if (currentUser?.role !== "DOCTOR") {
    return;
  }

  const doctor = await Doctor.findOne({
    where: { user_id: currentUser.id },
    attributes: ["id"],
    transaction,
  });

  if (!doctor || doctor.id !== appointment.doctor_id) {
    const error = new Error("Bạn không có quyền thao tác lịch hẹn của bác sĩ khác");
    error.statusCode = 403;
    throw error;
  }
};

const ensureQueueIsCurrentTurnForStart = async (queue, transaction) => {
  const candidateQueues = await Queue.findAll({
    where: {
      doctor_id: queue.doctor_id,
      date: queue.date,
      actual_end: null,
    },
    include: [
      {
        model: Appointment,
        attributes: ["id", "status"],
      },
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const inProgressQueue = candidateQueues.find(
    (item) => item.actual_start && item.id !== queue.id
  );

  if (inProgressQueue) {
    const error = new Error(
      `Chưa thể bắt đầu ca này vì số thứ tự #${inProgressQueue.queue_number} đang được khám`
    );
    error.statusCode = 409;
    throw error;
  }

  const waitingQueues = candidateQueues
    .filter((item) => !item.actual_start && item.Appointment?.status === APPOINTMENT_STATUS.CHECKED_IN)
    .sort(compareQueuesByServiceOrder);

  if (waitingQueues.length === 0) {
    return;
  }

  const blockingQueue = waitingQueues[0];
  if (blockingQueue.id === queue.id) {
    return;
  }

  const error = new Error(
    `Chưa thể bắt đầu ca này vì số thứ tự #${blockingQueue.queue_number} có giờ hẹn ưu tiên hơn và đang chờ khám`
  );
  error.statusCode = 409;
  throw error;
};

const ensureDoctorWorkingAtTime = async (doctorId, date, timeSlot, transaction) => {
  const dayOfWeek = getDayOfWeekFromDate(date);
  const slotMinutes = normalizeSlotMinutes(DEFAULT_APPOINTMENT_SLOT_MINUTES);
  const slotStartSeconds = timeToSeconds(timeSlot);
  const slotEndSeconds = slotStartSeconds + slotMinutes * 60;
  const schedules = await WorkSchedule.findAll({
    where: {
      doctor_id: doctorId,
      day_of_week: dayOfWeek,
    },
    transaction,
  });

  if (schedules.length === 0) {
    const error = new Error("Bác sĩ không có lịch làm việc tại thời điểm đã chọn");
    error.statusCode = 400;
    throw error;
  }

  const hasMatchingSchedule = schedules.some((schedule) => {
    const scheduleStartSeconds = timeToSeconds(toTimeString(schedule.start_time));
    const scheduleEndSeconds = timeToSeconds(toTimeString(schedule.end_time));
    return slotStartSeconds >= scheduleStartSeconds && slotEndSeconds <= scheduleEndSeconds;
  });

  if (!hasMatchingSchedule) {
    const error = new Error("Bác sĩ không có lịch làm việc trọn vẹn cho khung giờ đã chọn");
    error.statusCode = 400;
    throw error;
  }

  const blocks = await WorkScheduleBlock.findAll({
    where: {
      doctor_id: doctorId,
      date,
      status: "Approved",
    },
    attributes: ["is_off", "start_time", "end_time"],
    transaction,
  });

  if (blocks.some((block) => block.is_off)) {
    const error = new Error("Bác sĩ nghỉ trong ngày đã chọn");
    error.statusCode = 400;
    throw error;
  }

  const blockRanges = blocks
    .filter((block) => !block.is_off && block.start_time && block.end_time)
    .map((block) => ({
      startSeconds: timeToSeconds(toTimeString(block.start_time)),
      endSeconds: timeToSeconds(toTimeString(block.end_time)),
    }));

  if (isSlotBlockedByRange(timeSlot, slotMinutes, blockRanges)) {
    const error = new Error("Khung giờ đã chọn nằm trong thời gian bác sĩ tạm ngưng làm việc");
    error.statusCode = 400;
    throw error;
  }
};

const ensureDoctorWorkingOnDate = async (
  doctorId,
  date,
  preferredPeriod,
  transaction,
) => {
  const dayOfWeek = getDayOfWeekFromDate(date);
  const slotMinutes = normalizeSlotMinutes(DEFAULT_APPOINTMENT_SLOT_MINUTES);
  const schedules = await WorkSchedule.findAll({
    where: {
      doctor_id: doctorId,
      day_of_week: dayOfWeek,
    },
    order: [["start_time", "ASC"]],
    transaction,
  });

  if (schedules.length === 0) {
    const error = new Error("Bác sĩ không có lịch làm việc trong ngày đã chọn");
    error.statusCode = 400;
    throw error;
  }

  const blocks = await WorkScheduleBlock.findAll({
    where: {
      doctor_id: doctorId,
      date,
      status: "Approved",
    },
    attributes: ["is_off", "start_time", "end_time"],
    transaction,
  });

  if (blocks.some((block) => block.is_off)) {
    const error = new Error("Bác sĩ nghỉ trong ngày đã chọn");
    error.statusCode = 400;
    throw error;
  }

  const candidateSlots = new Set();

  for (const schedule of schedules) {
    const slots = buildTimeSlots(
      toTimeString(schedule.start_time),
      toTimeString(schedule.end_time),
      slotMinutes
    );

    for (const slot of slots) {
      candidateSlots.add(slot);
    }
  }

  const blockRanges = blocks
    .filter((block) => !block.is_off && block.start_time && block.end_time)
    .map((block) => ({
      startSeconds: timeToSeconds(toTimeString(block.start_time)),
      endSeconds: timeToSeconds(toTimeString(block.end_time)),
    }));

  const availableSlots = filterPastSlotsForDate(
    filterSlotsByPreferredPeriod(Array.from(candidateSlots).sort(), preferredPeriod)
      .filter((slot) => !isSlotBlockedByRange(slot, slotMinutes, blockRanges)),
    date,
    slotMinutes,
  );

  if (availableSlots.length === 0) {
    const error = new Error(
      preferredPeriod === APPOINTMENT_PREFERRED_PERIOD.MORNING
        ? "Bác sĩ không có lịch làm việc khả dụng trong buổi sáng đã chọn"
        : preferredPeriod === APPOINTMENT_PREFERRED_PERIOD.AFTERNOON
          ? "Bác sĩ không có lịch làm việc khả dụng trong buổi chiều đã chọn"
          : "Bác sĩ không có lịch làm việc khả dụng trong ngày đã chọn"
    );
    error.statusCode = 400;
    throw error;
  }

  const activeAppointments = await Appointment.count({
    where: {
      doctor_id: doctorId,
      date,
      status: {
        [Op.in]: [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.CHECKED_IN, APPOINTMENT_STATUS.COMPLETED],
      },
    },
    transaction,
  });

  if (activeAppointments >= availableSlots.length) {
    const error = new Error("Bác sĩ đã kín lịch trong ngày đã chọn");
    error.statusCode = 409;
    throw error;
  }
};

const estimateAppointmentStart = async (appointmentLike, transaction) => {
  if (!appointmentLike?.doctor_id || !appointmentLike?.date) {
    return null;
  }

  const forecast = await simulateEstimatedStartForAppointmentService(appointmentLike, transaction);
  return forecast?.estimated_start
    ? formatDateTimeAtBusinessOffset(forecast.estimated_start)
    : null;
};

const appointmentQueryOptions = {
  include: [
    {
      model: User,
      as: "patient",
      attributes: ["id", "fullname", "username", "phone", "email", "role", "date_of_birth", "gender", "address"],
    },
    {
      model: Doctor,
      include: [
        {
          model: User,
          attributes: ["id", "fullname", "username", "role"],
        },
        {
          model: Specialty,
          attributes: ["id", "name"],
        },
        {
          model: Room,
          attributes: ["id", "name", "floor"],
        },
      ],
    },
    {
      model: Queue,
      attributes: ["id", "queue_number", "checked_in_at", "original_estimated_start", "estimated_start", "forecast_updated_at", "predicted_wait_minutes", "actual_start", "actual_end", "latest_prediction_id"],
      required: false,
    },
  ],
  order: [
    ["date", "ASC"],
    ["time_slot", "ASC"],
    ["id", "ASC"],
  ],
};

export const getAllAppointmentsService = async (currentUser, filters = {}) => {
  const pagination = parsePaginationQuery(filters, { defaultPageSize: 10 });
  const queryOptions = {
    ...appointmentQueryOptions,
    include: appointmentQueryOptions.include.map((item) => ({ ...item })),
  };
  const where = {};
  const patientInclude = queryOptions.include[0];
  const doctorInclude = queryOptions.include[1];
  const doctorUserInclude = doctorInclude.include[0];

  const status = normalizeOptionalAppointmentStatusFilter(filters?.status);
  const doctorId =
    filters?.doctor_id !== undefined && filters?.doctor_id !== null && filters?.doctor_id !== ""
      ? parseId(filters.doctor_id)
      : undefined;
  const patientId =
    filters?.patient_id !== undefined && filters?.patient_id !== null && filters?.patient_id !== ""
      ? parseId(filters.patient_id)
      : undefined;
  const specialtyId =
    filters?.specialty_id !== undefined && filters?.specialty_id !== null && filters?.specialty_id !== ""
      ? parseId(filters.specialty_id)
      : undefined;
  const dateFrom = normalizeOptionalFilterDate(filters?.date_from, "date_from");
  const dateTo = normalizeOptionalFilterDate(filters?.date_to, "date_to");
  const q = normalizeOptionalQueryString(filters?.q);

  if (currentUser?.role === "DOCTOR") {
    const doctor = await Doctor.findOne({ where: { user_id: currentUser.id }, attributes: ["id"] });
    if (!doctor) {
      return createListResult({
        items: [],
        pagination: pagination.enabled
          ? buildPaginationMeta({
              page: pagination.page,
              page_size: pagination.page_size,
              total_items: 0,
            })
          : null,
      });
    }

    where.doctor_id = doctor.id;
  } else if (doctorId) {
    where.doctor_id = doctorId;
  }

  if (currentUser?.role === "PATIENT") {
    where.patient_id = currentUser.id;
  } else if (patientId) {
    where.patient_id = patientId;
  }

  if (status) {
    where.status = status;
  }

  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) {
      where.date[Op.gte] = dateFrom;
    }
    if (dateTo) {
      where.date[Op.lte] = dateTo;
    }
  }

  if (specialtyId) {
    doctorInclude.where = {
      ...(doctorInclude.where || {}),
      specialty_id: specialtyId,
    };
  }

  if (Object.keys(where).length > 0) {
    queryOptions.where = where;
  }

  if (q) {
    patientInclude.required = false;
    doctorInclude.required = false;
    doctorUserInclude.required = false;
  }

  const appointmentResult = !q && pagination.enabled
    ? await Appointment.findAndCountAll({
        ...queryOptions,
        distinct: true,
        limit: pagination.limit,
        offset: pagination.offset,
      })
    : null;

  const appointmentRows = appointmentResult?.rows ?? await Appointment.findAll(queryOptions);

  const filteredAppointments = filterItemsByLooseSearch(appointmentRows, q, (appointment) => [
    appointment.reason,
    appointment.patient?.fullname,
    appointment.patient?.username,
    appointment.patient?.phone,
    appointment.Doctor?.User?.fullname,
    appointment.Doctor?.User?.username,
    appointment.Doctor?.Specialty?.name,
  ]);

  const pagedAppointments = q && pagination.enabled
    ? filteredAppointments.slice(pagination.offset, pagination.offset + pagination.limit)
    : filteredAppointments;

  const estimatedAppointments = await Promise.all(
    pagedAppointments.map(async (appointment) => {
      const serialized = serializeAppointment(appointment);
      if (serialized?.estimated_start) {
        return serialized;
      }

      return {
        ...serialized,
        estimated_start: await estimateAppointmentStart(serialized, null),
      };
    })
  );

  const statusSummary = currentUser?.role === "ADMIN"
    ? await buildAppointmentStatusSummary({
        baseWhere: queryOptions.where || {},
        specialtyId,
      })
    : null;

  return {
    ...createListResult({
      items: estimatedAppointments,
      pagination: !q && pagination.enabled
        ? buildPaginationMeta({
            page: pagination.page,
            page_size: pagination.page_size,
            total_items: appointmentResult?.count ?? filteredAppointments.length,
          })
        : createPaginatedListResult({
            items: filteredAppointments,
            pagination,
          }).pagination,
    }),
    summary: statusSummary,
  };
};

const buildAppointmentStatusSummary = async ({ baseWhere = {}, specialtyId }) => {
  const summaryWhere = { ...baseWhere };
  delete summaryWhere.status;

  const include = [];
  if (specialtyId) {
    include.push({
      model: Doctor,
      attributes: [],
      where: { specialty_id: specialtyId },
      required: true,
    });
  }

  const rows = await Appointment.findAll({
    attributes: ["status"],
    where: summaryWhere,
    include,
  });

  return rows.reduce(
    (result, appointment) => {
      const status = appointment.status;
      result.total += 1;
      result.by_status[status] = (result.by_status[status] || 0) + 1;
      return result;
    },
    { total: 0, by_status: {} },
  );
};

export const getAppointmentByIdService = async (id, transaction) => {
  const appointmentId = parseId(id);
  const appointment = await Appointment.findByPk(appointmentId, {
    include: appointmentQueryOptions.include,
    transaction,
  });

  if (!appointment) {
    const error = new Error("Không tìm thấy lịch hẹn");
    error.statusCode = 404;
    throw error;
  }

  const serialized = serializeAppointment(appointment);
  if (serialized?.estimated_start) {
    return serialized;
  }

  return {
    ...serialized,
    estimated_start: await estimateAppointmentStart(serialized, transaction),
  };
};

export const createAppointmentService = async (payload, currentUser) => {
  return executeWithUniqueConstraintHandling(async () => {
    return runReadCommittedTransaction(async (transaction) => {
      await cleanupExpiredPendingAppointments(transaction);

      const requestedPatientId = currentUser?.role === "PATIENT" ? currentUser.id : payload?.patient_id;
      const patientId = await ensurePatientExists(requestedPatientId, transaction);
      const doctorId = await ensureDoctorExists(payload?.doctor_id, transaction);
      const date = normalizeDate(payload?.date);
      const isPatientSelfBooking = currentUser?.role === "PATIENT";
      const timeSlot = isPatientSelfBooking ? normalizeOptionalTime(payload?.time_slot) : normalizeTime(payload?.time_slot);
      const preferredPeriod = normalizePreferredPeriod(payload?.preferred_period, false);
      const reason = normalizeReason(payload?.reason);

      if (Object.prototype.hasOwnProperty.call(payload || {}, "status")) {
        const error = new Error(
          "Không được truyền status khi tạo lịch hẹn"
        );
        error.statusCode = 400;
        throw error;
      }

      const status = APPOINTMENT_STATUS.CONFIRMED;
      const holdExpiresAt = null;

      if (isPatientSelfBooking) {
        ensurePatientBookingDateAllowed(date);
      }

      if (timeSlot) {
        await ensureDoctorWorkingAtTime(doctorId, date, timeSlot, transaction);
      } else {
        await ensureDoctorWorkingOnDate(doctorId, date, preferredPeriod, transaction);
      }

      await ensureNoActiveDuplicateAppointment(patientId, doctorId, date, transaction);

      const created = await Appointment.create(
        {
          patient_id: patientId,
          doctor_id: doctorId,
          date,
          time_slot: timeSlot,
          preferred_period: preferredPeriod,
          reason,
          status,
          hold_expires_at: holdExpiresAt,
        },
        { transaction }
      );

      return getAppointmentByIdService(created.id, transaction);
    });
  });
};

export const getDoctorAvailabilityService = async (doctorId, query) => {
  const parsedDoctorId = await ensureDoctorExists(doctorId);

  const startDate = query?.start_date ? normalizeDate(query.start_date) : formatDateUTC(new Date());
  const slotMinutes = normalizeSlotMinutes(query?.slot_minutes);

  const startDateObj = parseDateOnlyToUTC(startDate);
  const endDate = query?.end_date
    ? normalizeDate(query.end_date)
    : formatDateUTC(addDaysUTC(startDateObj, 14));
  const endDateObj = parseDateOnlyToUTC(endDate);

  if (endDateObj < startDateObj) {
    const error = new Error("end_date phải lớn hơn hoặc bằng start_date");
    error.statusCode = 400;
    throw error;
  }

  const dayRange = Math.floor((endDateObj - startDateObj) / (24 * 3600 * 1000));
  if (dayRange > 60) {
    const error = new Error("Khoảng ngày truy vấn không được vượt quá 60 ngày");
    error.statusCode = 400;
    throw error;
  }

  const schedules = await WorkSchedule.findAll({
    where: { doctor_id: parsedDoctorId },
    order: [
      ["day_of_week", "ASC"],
      ["start_time", "ASC"],
    ],
  });

  if (schedules.length === 0) {
    return {
      doctor_id: parsedDoctorId,
      start_date: startDate,
      end_date: endDate,
      slot_minutes: slotMinutes,
      days: [],
    };
  }

  const appointments = await Appointment.findAll({
    where: {
      doctor_id: parsedDoctorId,
      date: { [Op.between]: [startDate, endDate] },
      status: { [Op.notIn]: [APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.NO_SHOW] },
    },
    attributes: ["date", "time_slot"],
  });

  const blocks = await WorkScheduleBlock.findAll({
    where: {
      doctor_id: parsedDoctorId,
      date: { [Op.between]: [startDate, endDate] },
      status: "Approved",
    },
    attributes: ["date", "is_off", "start_time", "end_time", "reason"],
  });

  const bookedByDate = new Map();
  const unslottedBookedCountByDate = new Map();
  for (const item of appointments) {
    const dateKey = item.date;
    if (item.time_slot) {
      const timeKey = String(item.time_slot).slice(0, 8);

      if (!bookedByDate.has(dateKey)) {
        bookedByDate.set(dateKey, new Set());
      }
      bookedByDate.get(dateKey).add(timeKey);
      continue;
    }

    unslottedBookedCountByDate.set(
      dateKey,
      (unslottedBookedCountByDate.get(dateKey) || 0) + 1,
    );
  }

  const blocksByDate = new Map();
  for (const item of blocks) {
    const dateKey = item.date;

    if (!blocksByDate.has(dateKey)) {
      blocksByDate.set(dateKey, []);
    }

    blocksByDate.get(dateKey).push(item);
  }

  const days = [];

  for (let cursor = new Date(startDateObj); cursor <= endDateObj; cursor = addDaysUTC(cursor, 1)) {
    const dateKey = formatDateUTC(cursor);
    const dayOfWeek = cursor.getUTCDay();
    const workingSchedules = schedules.filter((item) => item.day_of_week === dayOfWeek);
    const dayBlocks = blocksByDate.get(dateKey) || [];
    const offBlocks = dayBlocks.filter((block) => block.is_off);
    const isOff = offBlocks.length > 0;

    if (workingSchedules.length === 0 && !isOff) {
      continue;
    }

    const candidateSlots = new Set();
    const workingPeriods = [];

    for (const schedule of workingSchedules) {
      workingPeriods.push({
        start_time: toTimeString(schedule.start_time),
        end_time: toTimeString(schedule.end_time),
      });

      const slots = buildTimeSlots(
        toTimeString(schedule.start_time),
        toTimeString(schedule.end_time),
        slotMinutes
      );

      for (const slot of slots) {
        candidateSlots.add(slot);
      }
    }

    const sortedCandidates = filterPastSlotsForDate(
      Array.from(candidateSlots).sort(),
      dateKey,
      slotMinutes,
    );
    const bookedSlots = Array.from(bookedByDate.get(dateKey) || []).sort();
    const bookedSet = new Set(bookedSlots);
    const unslottedBookedCount = unslottedBookedCountByDate.get(dateKey) || 0;
    const blockRanges = dayBlocks
      .filter((block) => !block.is_off && block.start_time && block.end_time)
      .map((block) => ({
        startSeconds: timeToSeconds(toTimeString(block.start_time)),
        endSeconds: timeToSeconds(toTimeString(block.end_time)),
      }));
    const unbookedSlots = isOff
      ? []
      : sortedCandidates.filter(
          (slot) => !bookedSet.has(slot) && !isSlotBlockedByRange(slot, slotMinutes, blockRanges)
        );
    const availableSlots = unbookedSlots.slice(
      Math.min(unslottedBookedCount, unbookedSlots.length),
    );
    const blockedPeriods = dayBlocks
      .filter((block) => !block.is_off && block.start_time && block.end_time)
      .map((block) => ({
        start_time: toTimeString(block.start_time),
        end_time: toTimeString(block.end_time),
        reason: block.reason || null,
      }));
    const offReason =
      offBlocks
        .map((block) => (typeof block.reason === "string" ? block.reason.trim() : ""))
        .find(Boolean) || null;

    days.push({
      date: dateKey,
      day_of_week: dayOfWeek,
      is_off: isOff,
      off_reason: offReason,
      working_periods: workingPeriods,
      blocked_periods: blockedPeriods,
      booked_slots: bookedSlots,
      available_slots: availableSlots,
    });
  }

  return {
    doctor_id: parsedDoctorId,
    start_date: startDate,
    end_date: endDate,
    slot_minutes: slotMinutes,
    days,
  };
};

export const confirmAppointmentService = async (id, currentUser) => {
  const appointmentId = parseId(id);

  return runReadCommittedTransaction(async (transaction) => {
    await cleanupExpiredPendingAppointments(transaction);

    const appointment = await Appointment.findByPk(appointmentId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!appointment) {
      const error = new Error("Không tìm thấy lịch hẹn");
      error.statusCode = 404;
      throw error;
    }

    ensureCanConfirmAppointment(appointment, currentUser);

    if (appointment.status === APPOINTMENT_STATUS.CONFIRMED) {
      const error = new Error("Lịch hẹn đã được xác nhận trước đó");
      error.statusCode = 409;
      throw error;
    }

    ensureCanTransitionStatus(appointment.status, APPOINTMENT_STATUS.CONFIRMED);

    if (appointment.status === APPOINTMENT_STATUS.PENDING) {
      if (appointment.hold_expires_at && new Date(appointment.hold_expires_at) <= new Date()) {
        await appointment.update(
          {
            status: APPOINTMENT_STATUS.CANCELLED,
            hold_expires_at: null,
          },
          { transaction }
        );

        const error = new Error("Giữ chỗ đã hết hạn, vui lòng đặt lại lịch");
        error.statusCode = 409;
        throw error;
      }

      await appointment.update(
        {
          status: APPOINTMENT_STATUS.CONFIRMED,
          hold_expires_at: null,
        },
        { transaction }
      );

    }

    return getAppointmentByIdService(appointment.id, transaction);
  });
};

export const cancelAppointmentService = async (id, currentUser) => {
  const appointmentId = parseId(id);

  return runReadCommittedTransaction(async (transaction) => {
    await cleanupExpiredPendingAppointments(transaction);

    const appointment = await Appointment.findByPk(appointmentId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!appointment) {
      const error = new Error("Không tìm thấy lịch hẹn");
      error.statusCode = 404;
      throw error;
    }

    ensureCanCancelAppointment(appointment, currentUser);

    const isDoctorCancelAfterCheckIn = currentUser?.role === "DOCTOR";
    if (isDoctorCancelAfterCheckIn) {
      await ensureDoctorOwnsAppointment(appointment, currentUser, transaction);
    }

    if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
      const error = new Error("Lịch hẹn đã được hủy trước đó");
      error.statusCode = 409;
      throw error;
    }

    ensureCanTransitionStatus(appointment.status, APPOINTMENT_STATUS.CANCELLED);

    const existingQueue = await Queue.findOne({
      where: { appointment_id: appointment.id },
      attributes: ["id", "doctor_id", "date", "actual_start", "actual_end"],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (isDoctorCancelAfterCheckIn) {
      if (!existingQueue) {
        const error = new Error("Chỉ được hủy lượt khám sau khi bệnh nhân đã check-in");
        error.statusCode = 409;
        throw error;
      }

      if (existingQueue.actual_start || existingQueue.actual_end) {
        const error = new Error("Không thể hủy lượt khám đã bắt đầu hoặc đã hoàn tất");
        error.statusCode = 409;
        throw error;
      }
    } else {
      ensureCanCancelBy24HourRule(appointment);
    }

    if (existingQueue && !isDoctorCancelAfterCheckIn) {
      const error = new Error("Lịch hẹn đã check-in, vui lòng dùng chức năng hủy check-in thay vì hủy lịch");
      error.statusCode = 409;
      throw error;
    }

    await appointment.update(
      {
        status: APPOINTMENT_STATUS.CANCELLED,
        hold_expires_at: null,
      },
      { transaction }
    );

    if (isDoctorCancelAfterCheckIn) {
      if (SmsLog) {
        await SmsLog.destroy({
          where: {
            queue_id: existingQueue.id,
            status: "Pending",
          },
          transaction,
        });
      }

      await recalculateQueueForecastForDoctorDateService(
        existingQueue.doctor_id,
        existingQueue.date,
        transaction
      );
    }

    return getAppointmentByIdService(appointment.id, transaction);
  });
};

export const markAppointmentNoShowService = async (id, currentUser) => {
  const appointmentId = parseId(id);

  return runReadCommittedTransaction(async (transaction) => {
    await cleanupExpiredPendingAppointments(transaction);

    const appointment = await Appointment.findByPk(appointmentId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!appointment) {
      const error = new Error("Không tìm thấy lịch hẹn");
      error.statusCode = 404;
      throw error;
    }

    if (appointment.status === APPOINTMENT_STATUS.NO_SHOW) {
      const error = new Error("Lịch hẹn đã được ghi nhận vắng mặt trước đó");
      error.statusCode = 409;
      throw error;
    }

    if (
      appointment.status === APPOINTMENT_STATUS.CANCELLED ||
      appointment.status === APPOINTMENT_STATUS.COMPLETED
    ) {
      const error = new Error("Không thể ghi nhận vắng mặt cho lịch hẹn đã hủy hoặc đã hoàn tất");
      error.statusCode = 409;
      throw error;
    }

    const existingQueue = await Queue.findOne({
      where: { appointment_id: appointment.id },
      attributes: ["id", "doctor_id", "date", "actual_start", "actual_end"],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const todayBusinessDate = getTodayBusinessDateString();

    if (currentUser?.role === "DOCTOR") {
      await ensureDoctorOwnsAppointment(appointment, currentUser, transaction);

      if (appointment.status !== APPOINTMENT_STATUS.CHECKED_IN || !existingQueue) {
        const error = new Error("Bác sĩ chỉ có thể ghi nhận vắng mặt cho lượt đã check-in");
        error.statusCode = 403;
        throw error;
      }

      if (existingQueue.date !== todayBusinessDate) {
        const error = new Error("Bác sĩ chỉ có thể ghi nhận vắng mặt cho hàng đợi trong ngày");
        error.statusCode = 409;
        throw error;
      }
    } else if (currentUser?.role === "RECEPTIONIST" || currentUser?.role === "ADMIN") {
      if (appointment.status !== APPOINTMENT_STATUS.CONFIRMED || existingQueue) {
        const error = new Error("Lễ tân chỉ có thể ghi nhận vắng mặt cho lịch chờ check-in");
        error.statusCode = 409;
        throw error;
      }

      if (appointment.date !== todayBusinessDate) {
        const error = new Error("Lễ tân chỉ có thể ghi nhận vắng mặt cho lịch chờ check-in trong ngày");
        error.statusCode = 409;
        throw error;
      }
    } else {
      const error = new Error("Bạn không có quyền ghi nhận vắng mặt");
      error.statusCode = 403;
      throw error;
    }

    if (existingQueue?.actual_start || existingQueue?.actual_end) {
      const error = new Error("Không thể ghi nhận vắng mặt cho lượt khám đã bắt đầu hoặc đã hoàn tất");
      error.statusCode = 409;
      throw error;
    }

    let recalcTarget = null;

    if (existingQueue) {
      await WaitPrediction.destroy({
        where: { queue_id: existingQueue.id },
        transaction,
      });

      if (SmsLog) {
        await SmsLog.destroy({
          where: {
            queue_id: existingQueue.id,
            status: "Pending",
          },
          transaction,
        });
      }

      recalcTarget = {
        doctorId: existingQueue.doctor_id,
        date: existingQueue.date,
      };
    }

    await appointment.update(
      {
        status: APPOINTMENT_STATUS.NO_SHOW,
        hold_expires_at: null,
      },
      { transaction }
    );

    if (recalcTarget) {
      await recalculateQueueForecastForDoctorDateService(
        recalcTarget.doctorId,
        recalcTarget.date,
        transaction
      );
    }

    return getAppointmentByIdService(appointment.id, transaction);
  });
};

export const rescheduleAppointmentService = async (id, payload, currentUser) => {
  const appointmentId = parseId(id);
  const safePayload = payload || {};

  return executeWithUniqueConstraintHandling(async () => {
    return runReadCommittedTransaction(async (transaction) => {
      await cleanupExpiredPendingAppointments(transaction);

      const oldAppointment = await Appointment.findByPk(appointmentId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!oldAppointment) {
        const error = new Error("Không tìm thấy lịch hẹn");
        error.statusCode = 404;
        throw error;
      }

      if (oldAppointment.status === APPOINTMENT_STATUS.CANCELLED) {
        const error = new Error("Không thể đổi lịch từ lịch hẹn đã hủy");
        error.statusCode = 400;
        throw error;
      }

      ensureCanTransitionStatus(oldAppointment.status, APPOINTMENT_STATUS.CANCELLED);

      const existingQueue = await Queue.findOne({
        where: { appointment_id: oldAppointment.id },
        attributes: ["id", "doctor_id", "date"],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      const nextDoctorId = Object.prototype.hasOwnProperty.call(safePayload, "doctor_id")
        ? await ensureDoctorExists(safePayload.doctor_id, transaction)
        : oldAppointment.doctor_id;

      const nextDate = Object.prototype.hasOwnProperty.call(safePayload, "date")
        ? normalizeDate(safePayload.date)
        : oldAppointment.date;

      const nextTimeSlot = Object.prototype.hasOwnProperty.call(safePayload, "time_slot")
        ? normalizeTime(safePayload.time_slot)
        : toTimeString(oldAppointment.time_slot);

      const nextReason = Object.prototype.hasOwnProperty.call(safePayload, "reason")
        ? normalizeReason(safePayload.reason)
        : oldAppointment.reason;

      ensureAppointmentNotInPastForUpdate(nextDate, nextTimeSlot);
      await ensureNoActiveDuplicateAppointment(
        oldAppointment.patient_id,
        nextDoctorId,
        nextDate,
        transaction,
        { excludeAppointmentId: oldAppointment.id },
      );

      const createdAppointment = await Appointment.create(
        {
          patient_id: oldAppointment.patient_id,
          doctor_id: nextDoctorId,
          date: nextDate,
          time_slot: nextTimeSlot,
          reason: nextReason,
          status: APPOINTMENT_STATUS.CONFIRMED,
          hold_expires_at: null,
        },
        { transaction }
      );

      await ensureDoctorWorkingAtTime(nextDoctorId, nextDate, nextTimeSlot, transaction);

      await oldAppointment.update(
        {
          status: APPOINTMENT_STATUS.CANCELLED,
          hold_expires_at: null,
        },
        { transaction }
      );

      if (existingQueue) {
        await WaitPrediction.destroy({
          where: { queue_id: existingQueue.id },
          transaction,
        });

        await existingQueue.destroy({ transaction });

        await recalculateQueueForecastForDoctorDateService(
          existingQueue.doctor_id,
          existingQueue.date,
          transaction,
        );
      }

      console.info(
        `Appointment rescheduled by ${currentUser?.role || "UNKNOWN"}#${currentUser?.id || "?"}: old=${oldAppointment.id}, new=${createdAppointment.id}`
      );

      return getAppointmentByIdService(createdAppointment.id, transaction);
    });
  });
};

export const startAppointmentService = async (id, payload, currentUser) => {
  const appointmentId = parseId(id);
  const safePayload = payload || {};

  return runReadCommittedTransaction(async (transaction) => {
    await cleanupExpiredPendingAppointments(transaction);

    const appointment = await Appointment.findByPk(appointmentId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!appointment) {
      const error = new Error("Không tìm thấy lịch hẹn");
      error.statusCode = 404;
      throw error;
    }

    await ensureDoctorOwnsAppointment(appointment, currentUser, transaction);

    if (appointment.status !== APPOINTMENT_STATUS.CHECKED_IN) {
      const error = new Error("Chỉ có thể bắt đầu lịch hẹn ở trạng thái CheckedIn");
      error.statusCode = 409;
      throw error;
    }

    const queue = await Queue.findOne({
      where: { appointment_id: appointment.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!queue) {
      const error = new Error("Lịch hẹn chưa có số thứ tự");
      error.statusCode = 404;
      throw error;
    }

    if (queue.actual_start) {
      const error = new Error("Lịch hẹn đã được bắt đầu trước đó");
      error.statusCode = 409;
      throw error;
    }

    await ensureQueueIsCurrentTurnForStart(queue, transaction);

    const actualStart = normalizeOptionalDateTime(safePayload.actual_start, "actual_start", null);
    const resolvedActualStart = actualStart || new Date();

    if (queue.actual_end && queue.actual_end < resolvedActualStart) {
      const error = new Error("actual_start phải nhỏ hơn hoặc bằng actual_end");
      error.statusCode = 400;
      throw error;
    }

    await queue.update(
      {
        actual_start: actualStart || db.sequelize.literal("CURRENT_TIMESTAMP"),
      },
      { transaction }
    );

    await recalculateQueueForecastForDoctorDateService(appointment.doctor_id, appointment.date, transaction);

    const refreshedQueue = await Queue.findOne({
      where: { appointment_id: appointment.id },
      transaction,
    });

    const appointmentData = await getAppointmentByIdService(appointment.id, transaction);

    return {
      appointment: appointmentData,
      queue: serializeQueueDateTimes(refreshedQueue),
    };
  });
};

export const completeAppointmentService = async (id, payload, currentUser) => {
  const appointmentId = parseId(id);
  const safePayload = payload || {};

  return runReadCommittedTransaction(async (transaction) => {
    await cleanupExpiredPendingAppointments(transaction);

    const appointment = await Appointment.findByPk(appointmentId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!appointment) {
      const error = new Error("Không tìm thấy lịch hẹn");
      error.statusCode = 404;
      throw error;
    }

    await ensureDoctorOwnsAppointment(appointment, currentUser, transaction);

    ensureCanTransitionStatus(appointment.status, APPOINTMENT_STATUS.COMPLETED);

    const queue = await Queue.findOne({
      where: { appointment_id: appointment.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!queue) {
      const error = new Error("Lịch hẹn chưa có số thứ tự");
      error.statusCode = 404;
      throw error;
    }

    if (!queue.actual_start) {
      const error = new Error("Lịch hẹn chưa bắt đầu, vui lòng gọi API start trước");
      error.statusCode = 409;
      throw error;
    }

    const actualEnd = normalizeOptionalDateTime(safePayload.actual_end, "actual_end", null);
    const resolvedActualEnd = actualEnd || new Date();

    if (resolvedActualEnd < queue.actual_start) {
      const error = new Error("actual_end phải lớn hơn hoặc bằng actual_start");
      error.statusCode = 400;
      throw error;
    }

    await queue.update(
      {
        actual_end: actualEnd || db.sequelize.literal("CURRENT_TIMESTAMP"),
      },
      { transaction }
    );

    const refreshedQueue = await Queue.findOne({
      where: { appointment_id: appointment.id },
      transaction,
    });

    await appointment.update(
      {
        status: APPOINTMENT_STATUS.COMPLETED,
        hold_expires_at: null,
      },
      { transaction }
    );

    await recalculateQueueForecastForDoctorDateService(appointment.doctor_id, appointment.date, transaction);

    const appointmentData = await getAppointmentByIdService(appointment.id, transaction);

    return {
      appointment: appointmentData,
      queue: serializeQueueDateTimes(refreshedQueue),
    };
  });
};

export const deleteAppointmentService = async (id) => {
  const appointmentId = parseId(id);
  const appointment = await Appointment.findByPk(appointmentId);

  if (!appointment) {
    const error = new Error("Không tìm thấy lịch hẹn");
    error.statusCode = 404;
    throw error;
  }

  const queue = await Queue.findOne({ where: { appointment_id: appointmentId } });
  if (queue) {
    const error = new Error("Không thể xóa lịch hẹn đã phát sinh số thứ tự");
    error.statusCode = 409;
    throw error;
  }

  if (
    appointment.status === APPOINTMENT_STATUS.CONFIRMED ||
    appointment.status === APPOINTMENT_STATUS.CHECKED_IN ||
    appointment.status === APPOINTMENT_STATUS.COMPLETED ||
    appointment.status === APPOINTMENT_STATUS.NO_SHOW
  ) {
    const error = new Error("Không thể xóa lịch hẹn đã xác nhận, đã check-in, đã hoàn tất hoặc đã ghi nhận lỡ hẹn");
    error.statusCode = 409;
    throw error;
  }

  await appointment.destroy();
};
