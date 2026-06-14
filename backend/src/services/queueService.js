import { Op } from "sequelize";
import db from "../models/index.js";
import { getAppointmentByIdService } from "./appointmentService.js";
import {
  compareQueuesByServiceOrder,
  recalculateQueueForecastForDoctorDateService,
} from "./queueForecastService.js";
import { enqueueCheckInEstimateNotificationForQueue } from "./notificationService.js";
import { createQueueActionLog } from "./queueActionLogService.js";
import {
  publishQueueForecastRealtimeEvent,
  publishQueueRealtimeEvent,
} from "./realtimeService.js";
import {
  buildPaginationMeta,
  createListResult,
  parsePaginationQuery,
} from "../utils/queryUtils.js";

const { sequelize, Queue, Appointment, User, Doctor, Specialty, Room, EQueueNumber, WaitPrediction } = db;
const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";
const MAX_ACTUAL_START_DRIFT_MINUTES =
  Number(process.env.MAX_ACTUAL_START_DRIFT_MINUTES) || 120;
const MAX_ACTUAL_END_DURATION_MINUTES =
  Number(process.env.MAX_ACTUAL_END_DURATION_MINUTES) || 240;
const QUEUE_APPOINTMENT_UNIQUE_INDEX = "uq_queues_appointment_id";
const QUEUE_DOCTOR_DATE_NUMBER_UNIQUE_INDEX = "uq_queues_doctor_date_queue_number";

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

const formatDateTimeWithBusinessOffset = (dateValue) => {
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

const getBusinessDateStringFromDateTime = (dateValue) => {
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
  return `${year}-${month}-${day}`;
};

const getTodayBusinessDateString = () => {
  return getBusinessDateStringFromDateTime(new Date());
};

const serializeQueueDateTimes = (queueRow) => {
  const data = typeof queueRow?.toJSON === "function" ? queueRow.toJSON() : queueRow;
  if (!data) {
    return data;
  }

  return {
    ...data,
    checked_in_at: formatDateTimeWithBusinessOffset(data.checked_in_at),
    original_estimated_start: formatDateTimeWithBusinessOffset(data.original_estimated_start),
    actual_start: formatDateTimeWithBusinessOffset(data.actual_start),
    actual_end: formatDateTimeWithBusinessOffset(data.actual_end),
    estimated_start: formatDateTimeWithBusinessOffset(data.estimated_start),
    forecast_updated_at: formatDateTimeWithBusinessOffset(data.forecast_updated_at),
    WaitPrediction: data.WaitPrediction
      ? {
          ...data.WaitPrediction,
          predicted_start: formatDateTimeWithBusinessOffset(data.WaitPrediction.predicted_start),
          created_at: formatDateTimeWithBusinessOffset(data.WaitPrediction.created_at),
        }
      : data.WaitPrediction,
  };
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

const APPOINTMENT_STATUS_VALUES = new Set([
  "Pending",
  "Confirmed",
  "CheckedIn",
  "Cancelled",
  "Completed",
  "NoShow",
]);
const APPOINTMENT_PRIORITY_VALUES = new Set(["Normal", "Priority", "Emergency"]);

const normalizeOptionalDoctorId = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return parseId(value);
};

const normalizeOptionalQueueDate = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const trimmed = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const error = new Error("date không hợp lệ, định dạng YYYY-MM-DD");
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

const normalizeOptionalAppointmentStatus = (value) => {
  if (value === undefined || value === null || value === "" || value === "ALL") {
    return null;
  }

  const trimmed = String(value).trim();
  if (!APPOINTMENT_STATUS_VALUES.has(trimmed)) {
    const error = new Error("status không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

const normalizeOptionalPriorityLevel = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const trimmed = String(value).trim();
  if (!APPOINTMENT_PRIORITY_VALUES.has(trimmed)) {
    const error = new Error("priority_level không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

const normalizePositiveInteger = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`${fieldName} phải là số nguyên dương`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
};

const normalizeDateTime = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${fieldName} không hợp lệ`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

const deriveEstimatedStartFromAppointment = (appointment) => {
  const dateValue = String(appointment?.date || "").slice(0, 10);
  const timeValue = String(appointment?.time_slot || "").slice(0, 8);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}:\d{2}$/.test(timeValue)) {
    return null;
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute, second] = timeValue.split(":").map(Number);

  const utcTimestamp =
    Date.UTC(year, month - 1, day, hour, minute, second) -
    BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000;

  return new Date(utcTimestamp);
};

const resolveEstimatedStartForQueue = async (appointment, payload, transaction) => {
  const hasEstimatedStartInPayload = Object.prototype.hasOwnProperty.call(payload || {}, "estimated_start");
  if (hasEstimatedStartInPayload) {
    return normalizeDateTime(payload?.estimated_start, "estimated_start");
  }

  const estimatedFromTimeSlot = deriveEstimatedStartFromAppointment(appointment);
  if (estimatedFromTimeSlot) {
    return estimatedFromTimeSlot;
  }

  const serializedAppointment = await getAppointmentByIdService(appointment.id, transaction);
  return normalizeDateTime(serializedAppointment?.estimated_start, "estimated_start");
};

const ensureTimeOrder = (actualStart, actualEnd) => {
  if (actualStart && actualEnd && actualEnd < actualStart) {
    const error = new Error("Thời gian kết thúc thực tế phải lớn hơn hoặc bằng thời gian bắt đầu thực tế");
    error.statusCode = 400;
    throw error;
  }
};

const ensureReasonableQueueTimes = ({
  queueDate,
  estimatedStart,
  actualStart,
  actualEnd,
  allowPastEstimatedStart = false,
}) => {
  const fields = [
    { key: "estimated_start", value: estimatedStart },
    { key: "actual_start", value: actualStart },
    { key: "actual_end", value: actualEnd },
  ];

  for (const field of fields) {
    if (!field.value) {
      continue;
    }

    const businessDate = getBusinessDateStringFromDateTime(field.value);
    if (businessDate !== queueDate) {
      const error = new Error(`${field.key} phải thuộc đúng ngày khám ${queueDate}`);
      error.statusCode = 400;
      throw error;
    }
  }

  if (estimatedStart && actualStart && actualStart < estimatedStart) {
    const error = new Error("Thời gian bắt đầu thực tế phải lớn hơn hoặc bằng thời gian dự kiến vào khám");
    error.statusCode = 400;
    throw error;
  }

  if (estimatedStart && actualEnd && actualEnd < estimatedStart) {
    const error = new Error("Thời gian kết thúc thực tế phải lớn hơn hoặc bằng thời gian dự kiến vào khám");
    error.statusCode = 400;
    throw error;
  }

  if (
    estimatedStart &&
    !actualStart &&
    !actualEnd &&
    !allowPastEstimatedStart &&
    estimatedStart.getTime() <= Date.now()
  ) {
    const error = new Error("Thời gian dự kiến vào khám phải lớn hơn thời điểm hiện tại");
    error.statusCode = 400;
    throw error;
  }

  if (estimatedStart && actualStart) {
    const driftMinutes = Math.abs(actualStart.getTime() - estimatedStart.getTime()) / (60 * 1000);
    if (driftMinutes > MAX_ACTUAL_START_DRIFT_MINUTES) {
      const error = new Error(
        `Thời gian bắt đầu thực tế không được lệch quá ${MAX_ACTUAL_START_DRIFT_MINUTES} phút so với thời gian dự kiến vào khám`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  if (actualStart && actualEnd) {
    const durationMinutes = (actualEnd.getTime() - actualStart.getTime()) / (60 * 1000);
    if (durationMinutes > MAX_ACTUAL_END_DURATION_MINUTES) {
      const error = new Error(
        `Thời gian kết thúc thực tế không được vượt quá ${MAX_ACTUAL_END_DURATION_MINUTES} phút kể từ thời gian bắt đầu thực tế`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  ensureTimeOrder(actualStart, actualEnd);
};

const ensureAppointmentExists = async (appointmentId, transaction) => {
  const parsedAppointmentId = parseId(appointmentId);
  const appointment = await Appointment.findByPk(parsedAppointmentId, {
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });

  if (!appointment) {
    const error = new Error("Không tìm thấy lịch hẹn");
    error.statusCode = 404;
    throw error;
  }

  if (appointment.status === "Cancelled") {
    const error = new Error("Không thể tạo số thứ tự cho lịch hẹn đã hủy");
    error.statusCode = 409;
    throw error;
  }

  if (appointment.status === "NoShow") {
    const error = new Error("Không thể tạo số thứ tự cho lịch hẹn đã ghi nhận lỡ hẹn");
    error.statusCode = 409;
    throw error;
  }

  if (appointment.status === "Completed") {
    const error = new Error("Không thể tạo số thứ tự cho lịch hẹn đã hoàn tất");
    error.statusCode = 409;
    throw error;
  }

  if (appointment.status !== "Confirmed") {
    const error = new Error("Chỉ có thể tạo số thứ tự cho lịch hẹn đã xác nhận");
    error.statusCode = 409;
    throw error;
  }

  return appointment;
};

const ensureCanCheckInAppointment = async (appointment, currentUser, transaction) => {
  if (currentUser?.role !== "DOCTOR") {
    return;
  }

  const currentDoctorId = await resolveDoctorIdFromCurrentUser(currentUser, transaction);
  if (appointment.doctor_id !== currentDoctorId) {
    const error = new Error("Bạn không có quyền check-in lịch hẹn của bác sĩ khác");
    error.statusCode = 403;
    throw error;
  }
};

const resolveDoctorIdFromCurrentUser = async (currentUser, transaction) => {
  if (currentUser?.role !== "DOCTOR") {
    return null;
  }

  const doctor = await Doctor.findOne({
    where: { user_id: currentUser.id },
    attributes: ["id"],
    transaction,
  });

  if (!doctor) {
    const error = new Error("Không tìm thấy thông tin bác sĩ");
    error.statusCode = 403;
    throw error;
  }

  return doctor.id;
};

const ensureDoctorCanUpdateQueue = async (queue, currentUser, transaction) => {
  if (currentUser?.role !== "DOCTOR") {
    return;
  }

  const currentDoctorId = await resolveDoctorIdFromCurrentUser(currentUser, transaction);
  if (queue.doctor_id !== currentDoctorId) {
    const error = new Error("Bạn không có quyền cập nhật số thứ tự của bác sĩ khác");
    error.statusCode = 403;
    throw error;
  }
};

const isUniqueConstraintViolation = (error) => {
  return error?.name === "SequelizeUniqueConstraintError";
};

const toQueueConflictError = (error) => {
  const constraintName = String(error?.original?.constraint || error?.parent?.constraint || "");
  const errorMessage = String(error?.original?.sqlMessage || error?.parent?.sqlMessage || error?.message || "");
  const hasAppointmentUniqueInMessage = errorMessage.includes(QUEUE_APPOINTMENT_UNIQUE_INDEX);
  const hasDoctorDateQueueUniqueInMessage = errorMessage.includes(QUEUE_DOCTOR_DATE_NUMBER_UNIQUE_INDEX);

  if (constraintName === QUEUE_APPOINTMENT_UNIQUE_INDEX || hasAppointmentUniqueInMessage) {
    const conflictError = new Error("Lịch hẹn này đã có số thứ tự");
    conflictError.statusCode = 409;
    return conflictError;
  }

  if (constraintName === QUEUE_DOCTOR_DATE_NUMBER_UNIQUE_INDEX || hasDoctorDateQueueUniqueInMessage) {
    const conflictError = new Error("Số thứ tự đã tồn tại cho bác sĩ trong ngày này");
    conflictError.statusCode = 409;
    return conflictError;
  }

  const fallbackError = new Error("Dữ liệu số thứ tự bị trùng, vui lòng thử lại");
  fallbackError.statusCode = 409;
  return fallbackError;
};

const queueQueryOptions = {
  include: [
    {
      model: Appointment,
      include: [
        {
          model: User,
          as: "patient",
          attributes: ["id", "fullname", "username", "phone", "email", "date_of_birth", "gender", "address"],
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
      ],
    },
    {
      model: WaitPrediction,
      as: "WaitPrediction",
      attributes: ["id", "predicted_wait_time", "predicted_start", "prediction_source", "model_version", "created_at"],
    },
  ],
  order: [
    ["queue_number", "ASC"],
    ["id", "ASC"],
  ],
};

const createQueueQueryOptions = () => {
  return {
    include: [
      {
        ...queueQueryOptions.include[0],
        include: queueQueryOptions.include[0].include.map((item) => {
          if (!item.include) {
            return { ...item };
          }

          return {
            ...item,
            include: item.include.map((nested) => ({ ...nested })),
          };
        }),
      },
      {
        ...queueQueryOptions.include[1],
      },
    ],
    order: [...queueQueryOptions.order],
  };
};

const generateQueueNumber = async (appointmentDate, doctorId, transaction) => {
  const [row] = await EQueueNumber.findOrCreate({
    where: { date: appointmentDate, doctor_id: doctorId },
    defaults: { date: appointmentDate, doctor_id: doctorId, current_number: 0 },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const existingMaxQueueNumber =
    (await Queue.max("queue_number", {
      where: {
        doctor_id: doctorId,
        date: appointmentDate,
      },
      transaction,
    })) || 0;

  row.current_number = Math.max(row.current_number || 0, existingMaxQueueNumber) + 1;
  await row.save({ transaction });
  return row.current_number;
};

export const reindexQueuesForDoctorDateService = async (doctorId, date, transaction) => {
  if (!doctorId || !date) {
    return;
  }

  const queues = await Queue.findAll({
    where: { doctor_id: doctorId, date },
    include: [
      {
        model: Appointment,
        attributes: ["id", "time_slot", "status"],
      },
    ],
    order: [
      [{ model: Appointment }, "time_slot", "ASC"],
      [{ model: Appointment }, "id", "ASC"],
      ["id", "ASC"],
    ],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });

  const activeQueues = [];

  for (const queue of queues) {
    if (queue.Appointment?.status === "Cancelled") {
      await queue.destroy({ transaction });
      continue;
    }

    activeQueues.push(queue);
  }

  for (let index = 0; index < activeQueues.length; index += 1) {
    const expectedQueueNumber = index + 1;
    if (activeQueues[index].queue_number !== expectedQueueNumber) {
      await activeQueues[index].update(
        { queue_number: expectedQueueNumber },
        { transaction }
      );
    }
  }

  const [row] = await EQueueNumber.findOrCreate({
    where: { date, doctor_id: doctorId },
    defaults: { date, doctor_id: doctorId, current_number: activeQueues.length },
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });

  if ((row.current_number || 0) !== activeQueues.length) {
    row.current_number = activeQueues.length;
    await row.save({ transaction });
  }
};

export const getAllQueuesService = async (currentUser, filters = {}) => {
  const pagination = parsePaginationQuery(filters);
  const queryOptions = createQueueQueryOptions();
  const where = {};
  const appointmentInclude = queryOptions.include[0];
  const appointmentWhere = {};

  const filterDate = normalizeOptionalQueueDate(filters?.date);
  const filterDoctorId = normalizeOptionalDoctorId(filters?.doctor_id);
  const filterStatus = normalizeOptionalAppointmentStatus(filters?.status);
  const filterAppointmentId =
    filters?.appointment_id !== undefined &&
    filters?.appointment_id !== null &&
    filters?.appointment_id !== ""
      ? parseId(filters.appointment_id)
      : undefined;
  const filterQueueNumber =
    filters?.queue_number !== undefined &&
    filters?.queue_number !== null &&
    filters?.queue_number !== ""
      ? parseId(filters.queue_number)
      : undefined;

  if (filterDate) {
    where.date = filterDate;
  }

  if (currentUser?.role === "DOCTOR") {
    const currentDoctorId = await resolveDoctorIdFromCurrentUser(currentUser);
    where.doctor_id = currentDoctorId;
  } else if (filterDoctorId) {
    where.doctor_id = filterDoctorId;
  }

  if (filterStatus) {
    appointmentWhere.status = filterStatus;
  }

  if (filterAppointmentId) {
    where.appointment_id = filterAppointmentId;
  }

  if (filterQueueNumber) {
    where.queue_number = filterQueueNumber;
  }

  if (Object.keys(where).length > 0) {
    queryOptions.where = where;
  }

  if (Object.keys(appointmentWhere).length > 0) {
    appointmentInclude.where = appointmentWhere;
  }

  const queueRows = pagination.enabled
    ? await Queue.findAndCountAll({
        ...queryOptions,
        distinct: true,
        limit: pagination.limit,
        offset: pagination.offset,
      })
    : {
        rows: await Queue.findAll(queryOptions),
        count: null,
      };

  queueRows.rows.sort(compareQueuesByServiceOrder);
  return createListResult({
    items: queueRows.rows.map(serializeQueueDateTimes),
    pagination: pagination.enabled
      ? buildPaginationMeta({
          page: pagination.page,
          page_size: pagination.page_size,
          total_items: queueRows.count,
        })
      : null,
  });
};

export const getQueueByIdService = async (id, currentUser) => {
  const queueId = parseId(id);
  const queue = await Queue.findByPk(queueId, {
    include: queueQueryOptions.include,
  });

  if (!queue) {
    const error = new Error("Không tìm thấy số thứ tự");
    error.statusCode = 404;
    throw error;
  }

  if (currentUser?.role === "DOCTOR") {
    const currentDoctorId = await resolveDoctorIdFromCurrentUser(currentUser);
    if (queue.doctor_id !== currentDoctorId) {
      const error = new Error("Bạn không có quyền xem số thứ tự của bác sĩ khác");
      error.statusCode = 403;
      throw error;
    }
  }

  return serializeQueueDateTimes(queue);
};

export const createQueueService = async (payload) => {
  try {
    const created = await sequelize.transaction(async (transaction) => {
      const appointment = await ensureAppointmentExists(payload?.appointment_id, transaction);

      const existed = await Queue.findOne({
        where: { appointment_id: appointment.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (existed) {
        const error = new Error("Lịch hẹn này đã có số thứ tự");
        error.statusCode = 409;
        throw error;
      }

      const actualStart = normalizeDateTime(payload?.actual_start, "actual_start");
      const actualEnd = normalizeDateTime(payload?.actual_end, "actual_end");
      const estimatedStart = await resolveEstimatedStartForQueue(appointment, payload, transaction);
      ensureReasonableQueueTimes({
        queueDate: appointment.date,
        estimatedStart,
        actualStart,
        actualEnd,
        allowPastEstimatedStart: true,
      });

      const queueNumber = await generateQueueNumber(appointment.date, appointment.doctor_id, transaction);
      const fromStatus = appointment.status;

      const queue = await Queue.create(
        {
          appointment_id: appointment.id,
          doctor_id: appointment.doctor_id,
          date: appointment.date,
          queue_number: queueNumber,
          checked_in_at: db.sequelize.literal("CURRENT_TIMESTAMP"),
          original_estimated_start: estimatedStart,
          actual_start: actualStart,
          actual_end: actualEnd,
          estimated_start: estimatedStart,
          forecast_updated_at: db.sequelize.literal("CURRENT_TIMESTAMP"),
          predicted_wait_minutes: 0,
        },
        { transaction }
      );

      await appointment.update(
        {
          status: "CheckedIn",
        },
        { transaction }
      );

      await createQueueActionLog({
        queueId: queue.id,
        appointmentId: appointment.id,
        action: "CHECK_IN",
        fromStatus,
        toStatus: "CheckedIn",
        metadata: {
          queue_number: queueNumber,
          source: "queue_create",
        },
      }, transaction);

      await recalculateQueueForecastForDoctorDateService(appointment.doctor_id, appointment.date, transaction);

      return queue;
    });

    const queue = await getQueueByIdService(created.id);
    await publishQueueRealtimeEvent({
      reason: "CHECK_IN",
      queue_id: queue.id,
      appointment_id: queue.appointment_id,
      doctor_id: queue.doctor_id,
      date: queue.date,
      patient_id: queue.Appointment?.patient_id,
      status: queue.Appointment?.status,
    });
    await publishQueueForecastRealtimeEvent({
      reason: "FORECAST_RECALCULATED",
      doctor_id: queue.doctor_id,
      date: queue.date,
    });

    return queue;
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw toQueueConflictError(error);
    }

    throw error;
  }
};

export const checkInAppointmentService = async (appointmentId, payload, currentUser) => {
  try {
    const created = await sequelize.transaction(async (transaction) => {
      const appointment = await ensureAppointmentExists(appointmentId, transaction);
      await ensureCanCheckInAppointment(appointment, currentUser, transaction);
      const priorityLevel = normalizeOptionalPriorityLevel(payload?.priority_level);

      if (appointment.date !== getTodayBusinessDateString()) {
        const error = new Error("Chỉ có thể check-in lịch hẹn trong đúng ngày khám");
        error.statusCode = 409;
        throw error;
      }

      const existed = await Queue.findOne({
        where: { appointment_id: appointment.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (existed) {
        const error = new Error("Lịch hẹn này đã được check-in trước đó");
        error.statusCode = 409;
        throw error;
      }

      const actualStart = normalizeDateTime(payload?.actual_start, "actual_start");
      const actualEnd = normalizeDateTime(payload?.actual_end, "actual_end");
      const estimatedStart = await resolveEstimatedStartForQueue(appointment, payload, transaction);
      ensureReasonableQueueTimes({
        queueDate: appointment.date,
        estimatedStart,
        actualStart,
        actualEnd,
        allowPastEstimatedStart: true,
      });

      const queueNumber = await generateQueueNumber(appointment.date, appointment.doctor_id, transaction);
      const fromStatus = appointment.status;

      const queue = await Queue.create(
        {
          appointment_id: appointment.id,
          doctor_id: appointment.doctor_id,
          date: appointment.date,
          queue_number: queueNumber,
          checked_in_at: db.sequelize.literal("CURRENT_TIMESTAMP"),
          original_estimated_start: estimatedStart,
          actual_start: actualStart,
          actual_end: actualEnd,
          estimated_start: estimatedStart,
          forecast_updated_at: db.sequelize.literal("CURRENT_TIMESTAMP"),
          predicted_wait_minutes: 0,
        },
        { transaction }
      );

      await appointment.update(
        {
          status: "CheckedIn",
          ...(priorityLevel ? { priority_level: priorityLevel } : {}),
        },
        { transaction }
      );

      await createQueueActionLog({
        queueId: queue.id,
        appointmentId: appointment.id,
        actor: currentUser,
        action: "CHECK_IN",
        fromStatus,
        toStatus: "CheckedIn",
        metadata: {
          queue_number: queueNumber,
          priority_level: priorityLevel || appointment.priority_level || "Normal",
        },
      }, transaction);

      await recalculateQueueForecastForDoctorDateService(appointment.doctor_id, appointment.date, transaction);

      return queue;
    });

    const queue = await getQueueByIdService(created.id);

    try {
      await enqueueCheckInEstimateNotificationForQueue(created.id);
    } catch (notificationError) {
      console.error(
        `[notification] failed to enqueue CHECKIN_ESTIMATE for queue #${created.id}: ${notificationError.message}`
      );
    }

    await publishQueueRealtimeEvent({
      reason: "CHECK_IN",
      queue_id: queue.id,
      appointment_id: queue.appointment_id,
      doctor_id: queue.doctor_id,
      date: queue.date,
      patient_id: queue.Appointment?.patient_id,
      status: queue.Appointment?.status,
    });
    await publishQueueForecastRealtimeEvent({
      reason: "FORECAST_RECALCULATED",
      doctor_id: queue.doctor_id,
      date: queue.date,
    });

    return queue;
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw toQueueConflictError(error);
    }

    throw error;
  }
};

export const updateQueueService = async (id, payload, currentUser) => {
  const queueId = parseId(id);
  const updatedQueueId = await sequelize.transaction(async (transaction) => {
    const queue = await Queue.findByPk(queueId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!queue) {
      const error = new Error("Không tìm thấy số thứ tự");
      error.statusCode = 404;
      throw error;
    }

    await ensureDoctorCanUpdateQueue(queue, currentUser, transaction);

    const updates = {};

    if (Object.prototype.hasOwnProperty.call(payload, "queue_number")) {
      const error = new Error("queue_number được cấp tự động khi check-in");
      error.statusCode = 400;
      throw error;
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, "actual_start") ||
      Object.prototype.hasOwnProperty.call(payload, "actual_end")
    ) {
      const error = new Error("Không được cập nhật actual_start hoặc actual_end từ queue. Vui lòng dùng API bắt đầu/hoàn tất khám.");
      error.statusCode = 400;
      throw error;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "estimated_start")) {
      const error = new Error("estimated_start do hệ thống dự báo tự động quản lý, không được cập nhật thủ công");
      error.statusCode = 400;
      throw error;
    }

    if (Object.keys(updates).length === 0) {
      const error = new Error("Không có trường nào được phép cập nhật từ queue");
      error.statusCode = 400;
      throw error;
    }

    await queue.update(updates, { transaction });
    return queue.id;
  });

  return getQueueByIdService(updatedQueueId, currentUser);
};

export const deleteQueueService = async (id, currentUser) => {
  const queueId = parseId(id);
  const queue = await Queue.findByPk(queueId, {
    include: [
      {
        model: Appointment,
        attributes: ["id", "patient_id", "status"],
      },
    ],
  });

  if (!queue) {
    const error = new Error("Không tìm thấy số thứ tự");
    error.statusCode = 404;
    throw error;
  }

  if (currentUser?.role === "DOCTOR") {
    const error = new Error("Bác sĩ không có quyền hủy check-in");
    error.statusCode = 403;
    throw error;
  }

  if (queue.actual_start || queue.actual_end) {
    const error = new Error("Không thể hủy check-in cho lượt khám đã bắt đầu hoặc đã hoàn tất");
    error.statusCode = 409;
    throw error;
  }

  if (queue.Appointment?.status === "Completed") {
    const error = new Error("Không thể hủy check-in cho lịch hẹn đã hoàn tất");
    error.statusCode = 409;
    throw error;
  }

  const realtimePayload = await sequelize.transaction(async (transaction) => {
    const lockedQueue = await Queue.findByPk(queueId, {
      include: [
        {
          model: Appointment,
          attributes: ["id", "patient_id", "status"],
        },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!lockedQueue) {
      return;
    }

    if (lockedQueue.actual_start || lockedQueue.actual_end) {
      const error = new Error("Không thể hủy check-in cho lượt khám đã bắt đầu hoặc đã hoàn tất");
      error.statusCode = 409;
      throw error;
    }

    if (lockedQueue.Appointment?.status === "Completed") {
      const error = new Error("Không thể hủy check-in cho lịch hẹn đã hoàn tất");
      error.statusCode = 409;
      throw error;
    }

    await lockedQueue.Appointment?.update(
      {
        status: "Confirmed",
      },
      { transaction }
    );

    await createQueueActionLog({
      queueId: lockedQueue.id,
      appointmentId: lockedQueue.appointment_id,
      actor: currentUser,
      action: "CANCEL_CHECK_IN",
      fromStatus: lockedQueue.Appointment?.status || null,
      toStatus: "Confirmed",
      metadata: {
        queue_number: lockedQueue.queue_number,
      },
    }, transaction);

    await WaitPrediction.destroy({
      where: { queue_id: queueId },
      transaction,
    });

    // Drop pending notification logs when a check-in is cancelled.
    await db.SmsLog.destroy({
      where: {
        queue_id: queueId,
        status: "Pending",
      },
      transaction,
    });

    const doctorId = lockedQueue.doctor_id;
    const queueDate = lockedQueue.date;
    const payload = {
      reason: "CANCEL_CHECK_IN",
      queue_id: lockedQueue.id,
      appointment_id: lockedQueue.appointment_id,
      doctor_id: doctorId,
      date: queueDate,
      patient_id: lockedQueue.Appointment?.patient_id,
      status: "Confirmed",
    };
    await lockedQueue.destroy({ transaction });
    await recalculateQueueForecastForDoctorDateService(doctorId, queueDate, transaction);

    return payload;
  });

  if (realtimePayload) {
    await publishQueueRealtimeEvent(realtimePayload);
    await publishQueueForecastRealtimeEvent({
      reason: "FORECAST_RECALCULATED",
      doctor_id: realtimePayload.doctor_id,
      date: realtimePayload.date,
    });
  }
};
