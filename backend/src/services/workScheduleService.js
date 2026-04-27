import { Op, Transaction } from "sequelize";
import db from "../models/index.js";

const { WorkSchedule, Doctor, User, Appointment, sequelize } = db;
const MAX_SHIFTS_PER_DAY = Number(process.env.MAX_WORK_SHIFTS_PER_DAY) || 3;
const MIN_SCHEDULE_DURATION_MINUTES =
  Number(process.env.MIN_WORK_SCHEDULE_DURATION_MINUTES) || 30;
const SERIALIZATION_ERROR_CODES = new Set(["40001", "40P01"]);
const MAX_SERIALIZABLE_RETRIES = Number(process.env.MAX_SERIALIZABLE_RETRIES) || 2;

const parseId = (id) => {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error("ID không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  return parsed;
};

const normalizeDayOfWeek = (dayOfWeek) => {
  const parsed = Number(dayOfWeek);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) {
    const error = new Error("day_of_week phải là số nguyên từ 0 đến 6");
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

const normalizeTime = (value, fieldName) => {
  if (typeof value !== "string") {
    const error = new Error(`${fieldName} là bắt buộc`);
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  const matched = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(trimmed);

  if (!matched) {
    const error = new Error(`${fieldName} không hợp lệ, định dạng HH:mm hoặc HH:mm:ss`);
    error.statusCode = 400;
    throw error;
  }

  if (trimmed.length === 5) {
    return `${trimmed}:00`;
  }

  return trimmed;
};

const timeToSeconds = (timeValue) => {
  const [hours, minutes, seconds] = timeValue.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};

const toTimeString = (value) => String(value).slice(0, 8);

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

const getDayOfWeekFromDate = (dateValue) => {
  const { year, month, day } = parseDateParts(dateValue);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const getTodayUTCDateString = () => new Date().toISOString().slice(0, 10);

const isRetryableTransactionError = (error) => {
  const errorCode = String(error?.original?.code || error?.parent?.code || "");
  return SERIALIZATION_ERROR_CODES.has(errorCode);
};

const runSerializableTransaction = async (callback) => {
  for (let attempt = 0; attempt <= MAX_SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      return await sequelize.transaction(
        { isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE },
        callback
      );
    } catch (error) {
      if (isRetryableTransactionError(error) && attempt < MAX_SERIALIZABLE_RETRIES) {
        continue;
      }

      if (isRetryableTransactionError(error)) {
        const retryError = new Error("Dữ liệu lịch đang được cập nhật đồng thời, vui lòng thử lại");
        retryError.statusCode = 409;
        throw retryError;
      }

      throw error;
    }
  }
};

const ensureStartBeforeEnd = (startTime, endTime) => {
  if (timeToSeconds(startTime) >= timeToSeconds(endTime)) {
    const error = new Error("start_time phải nhỏ hơn end_time");
    error.statusCode = 400;
    throw error;
  }
};

const ensureTimeInWorkingWindow = (startTime, endTime) => {
  const minimumStart = 6 * 3600;
  const maximumEnd = 22 * 3600;

  if (timeToSeconds(startTime) < minimumStart || timeToSeconds(endTime) > maximumEnd) {
    const error = new Error("Khung giờ làm việc phải nằm trong khoảng 06:00 đến 22:00");
    error.statusCode = 400;
    throw error;
  }
};

const ensureMinimumScheduleDuration = (startTime, endTime) => {
  const durationSeconds = timeToSeconds(endTime) - timeToSeconds(startTime);
  const minimumDurationSeconds = MIN_SCHEDULE_DURATION_MINUTES * 60;

  if (durationSeconds < minimumDurationSeconds) {
    const error = new Error(
      `Mỗi ca làm việc phải có thời lượng tối thiểu ${MIN_SCHEDULE_DURATION_MINUTES} phút`
    );
    error.statusCode = 400;
    throw error;
  }
};

const ensureDoctorExists = async (doctorId, transaction) => {
  const parsedDoctorId = parseId(doctorId);
  const doctor = await Doctor.findByPk(parsedDoctorId, {
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (!doctor) {
    const error = new Error("Không tìm thấy bác sĩ");
    error.statusCode = 404;
    throw error;
  }

  return parsedDoctorId;
};

const ensureNoTimeOverlap = async (
  doctorId,
  dayOfWeek,
  startTime,
  endTime,
  options = {}
) => {
  const { excludedScheduleId = null, transaction } = options;
  const where = {
    doctor_id: doctorId,
    day_of_week: dayOfWeek,
    start_time: { [Op.lt]: endTime },
    end_time: { [Op.gt]: startTime },
  };

  if (excludedScheduleId) {
    where.id = { [Op.ne]: excludedScheduleId };
  }

  const overlapped = await WorkSchedule.findOne({
    where,
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (overlapped) {
    const error = new Error("Bác sĩ đã có lịch làm việc trùng khung giờ trong ngày này");
    error.statusCode = 409;
    throw error;
  }
};

const ensureNoRoomTimeOverlap = async (
  doctorId,
  dayOfWeek,
  startTime,
  endTime,
  options = {}
) => {
  const { excludedScheduleId = null, transaction } = options;
  const doctor = await Doctor.findByPk(doctorId, {
    attributes: ["id", "room_id"],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (!doctor || !doctor.room_id) {
    return;
  }

  const otherDoctors = await Doctor.findAll({
    where: {
      room_id: doctor.room_id,
      id: { [Op.ne]: doctorId },
    },
    attributes: ["id"],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (otherDoctors.length === 0) {
    return;
  }

  const otherDoctorIds = otherDoctors.map((item) => item.id);
  const where = {
    doctor_id: { [Op.in]: otherDoctorIds },
    day_of_week: dayOfWeek,
    start_time: { [Op.lt]: endTime },
    end_time: { [Op.gt]: startTime },
  };

  if (excludedScheduleId) {
    where.id = { [Op.ne]: excludedScheduleId };
  }

  const overlapped = await WorkSchedule.findOne({
    where,
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (overlapped) {
    const error = new Error("Phòng này đã có bác sĩ khác trong khung giờ này");
    error.statusCode = 409;
    throw error;
  }
};

const ensureMaxShiftsPerDay = async (doctorId, dayOfWeek, options = {}) => {
  const { excludedScheduleId = null, transaction } = options;
  const where = {
    doctor_id: doctorId,
    day_of_week: dayOfWeek,
  };

  if (excludedScheduleId) {
    where.id = { [Op.ne]: excludedScheduleId };
  }

  const existingShiftsCount = await WorkSchedule.count({
    where,
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (existingShiftsCount >= MAX_SHIFTS_PER_DAY) {
    const error = new Error(`Mỗi bác sĩ chỉ được tối đa ${MAX_SHIFTS_PER_DAY} ca trong một ngày`);
    error.statusCode = 409;
    throw error;
  }
};

const ensureNoImpactedAppointmentsForScheduleChange = async (
  currentSchedule,
  nextSchedule,
  transaction
) => {
  const currentDoctorId = currentSchedule.doctor_id;
  const currentDayOfWeek = currentSchedule.day_of_week;
  const currentStartTime = toTimeString(currentSchedule.start_time);
  const currentEndTime = toTimeString(currentSchedule.end_time);

  const impactedAppointments = await Appointment.findAll({
    where: {
      doctor_id: currentDoctorId,
      date: { [Op.gte]: getTodayUTCDateString() },
      status: { [Op.ne]: "Cancelled" },
    },
    attributes: ["id", "date", "time_slot"],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  const candidateAppointments = impactedAppointments.filter((appointment) => {
    const appointmentDay = getDayOfWeekFromDate(appointment.date);
    const appointmentTime = toTimeString(appointment.time_slot);

    if (appointmentDay !== currentDayOfWeek) {
      return false;
    }

    return (
      timeToSeconds(appointmentTime) >= timeToSeconds(currentStartTime) &&
      timeToSeconds(appointmentTime) < timeToSeconds(currentEndTime)
    );
  });

  if (candidateAppointments.length === 0) {
    return;
  }

  const remainingSchedules = await WorkSchedule.findAll({
    where: {
      doctor_id: currentDoctorId,
      day_of_week: currentDayOfWeek,
      id: { [Op.ne]: currentSchedule.id },
    },
    attributes: ["start_time", "end_time"],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  const effectiveSchedules = remainingSchedules.map((schedule) => ({
    startTime: toTimeString(schedule.start_time),
    endTime: toTimeString(schedule.end_time),
  }));

  if (
    nextSchedule &&
    nextSchedule.doctor_id === currentDoctorId &&
    nextSchedule.day_of_week === currentDayOfWeek
  ) {
    effectiveSchedules.push({
      startTime: toTimeString(nextSchedule.start_time),
      endTime: toTimeString(nextSchedule.end_time),
    });
  }

  const hasUncoveredAppointment = candidateAppointments.some((appointment) => {
    const appointmentTime = toTimeString(appointment.time_slot);
    const appointmentSeconds = timeToSeconds(appointmentTime);

    return !effectiveSchedules.some((schedule) => {
      const startSeconds = timeToSeconds(schedule.startTime);
      const endSeconds = timeToSeconds(schedule.endTime);
      return appointmentSeconds >= startSeconds && appointmentSeconds < endSeconds;
    });
  });

  if (hasUncoveredAppointment) {
    const error = new Error("Không thể thay đổi ca làm việc vì sẽ làm mất hiệu lực lịch hẹn đã đặt");
    error.statusCode = 409;
    throw error;
  }
};

const workScheduleQueryOptions = {
  include: [
    {
      model: Doctor,
      include: [
        {
          model: User,
          attributes: ["id", "fullname", "username", "role"],
        },
      ],
    },
  ],
  order: [
    ["doctor_id", "ASC"],
    ["day_of_week", "ASC"],
    ["start_time", "ASC"],
  ],
};

export const getAllWorkSchedulesService = async (currentUser) => {
  const queryOptions = { ...workScheduleQueryOptions };

  if (currentUser?.role === "DOCTOR") {
    const doctor = await Doctor.findOne({ where: { user_id: currentUser.id }, attributes: ["id"] });
    if (!doctor) {
      return [];
    }

    queryOptions.where = {
      doctor_id: doctor.id,
    };
  }

  return WorkSchedule.findAll(queryOptions);
};

export const getWorkScheduleByIdService = async (id, transaction) => {
  const scheduleId = parseId(id);

  const schedule = await WorkSchedule.findByPk(scheduleId, {
    include: workScheduleQueryOptions.include,
    transaction,
  });

  if (!schedule) {
    const error = new Error("Không tìm thấy lịch làm việc");
    error.statusCode = 404;
    throw error;
  }

  return schedule;
};

export const createWorkScheduleService = async (payload) => {
  const safePayload = payload || {};

  return runSerializableTransaction(async (transaction) => {
      const doctorId = await ensureDoctorExists(safePayload.doctor_id, transaction);
      const dayOfWeek = normalizeDayOfWeek(safePayload.day_of_week);
      const startTime = normalizeTime(safePayload.start_time, "start_time");
      const endTime = normalizeTime(safePayload.end_time, "end_time");

      ensureStartBeforeEnd(startTime, endTime);
      ensureMinimumScheduleDuration(startTime, endTime);
      ensureTimeInWorkingWindow(startTime, endTime);
      await ensureMaxShiftsPerDay(doctorId, dayOfWeek, { transaction });
      await ensureNoTimeOverlap(doctorId, dayOfWeek, startTime, endTime, { transaction });
      await ensureNoRoomTimeOverlap(doctorId, dayOfWeek, startTime, endTime, { transaction });

      const created = await WorkSchedule.create(
        {
          doctor_id: doctorId,
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
        },
        { transaction }
      );

      return getWorkScheduleByIdService(created.id, transaction);
    });
};

export const updateWorkScheduleService = async (id, payload) => {
  const scheduleId = parseId(id);
  const safePayload = payload || {};

  return runSerializableTransaction(async (transaction) => {
      const schedule = await WorkSchedule.findByPk(scheduleId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!schedule) {
        const error = new Error("Không tìm thấy lịch làm việc");
        error.statusCode = 404;
        throw error;
      }

      const updates = {};

      if (Object.prototype.hasOwnProperty.call(safePayload, "doctor_id")) {
        updates.doctor_id = await ensureDoctorExists(safePayload.doctor_id, transaction);
      }

      if (Object.prototype.hasOwnProperty.call(safePayload, "day_of_week")) {
        updates.day_of_week = normalizeDayOfWeek(safePayload.day_of_week);
      }

      if (Object.prototype.hasOwnProperty.call(safePayload, "start_time")) {
        updates.start_time = normalizeTime(safePayload.start_time, "start_time");
      }

      if (Object.prototype.hasOwnProperty.call(safePayload, "end_time")) {
        updates.end_time = normalizeTime(safePayload.end_time, "end_time");
      }

      if (Object.keys(updates).length === 0) {
        const error = new Error("Không có dữ liệu để cập nhật");
        error.statusCode = 400;
        throw error;
      }

      const effectiveDoctorId =
        updates.doctor_id !== undefined ? updates.doctor_id : schedule.doctor_id;
      const effectiveDayOfWeek =
        updates.day_of_week !== undefined ? updates.day_of_week : schedule.day_of_week;
      const effectiveStartTime =
        updates.start_time !== undefined ? updates.start_time : schedule.start_time;
      const effectiveEndTime =
        updates.end_time !== undefined ? updates.end_time : schedule.end_time;

      ensureStartBeforeEnd(effectiveStartTime, effectiveEndTime);
      ensureMinimumScheduleDuration(effectiveStartTime, effectiveEndTime);
      ensureTimeInWorkingWindow(effectiveStartTime, effectiveEndTime);
      await ensureMaxShiftsPerDay(effectiveDoctorId, effectiveDayOfWeek, {
        excludedScheduleId: schedule.id,
        transaction,
      });
      await ensureNoTimeOverlap(effectiveDoctorId, effectiveDayOfWeek, effectiveStartTime, effectiveEndTime, {
        excludedScheduleId: schedule.id,
        transaction,
      });
      await ensureNoRoomTimeOverlap(effectiveDoctorId, effectiveDayOfWeek, effectiveStartTime, effectiveEndTime, {
        excludedScheduleId: schedule.id,
        transaction,
      });

      await ensureNoImpactedAppointmentsForScheduleChange(
        schedule,
        {
          id: schedule.id,
          doctor_id: effectiveDoctorId,
          day_of_week: effectiveDayOfWeek,
          start_time: effectiveStartTime,
          end_time: effectiveEndTime,
        },
        transaction
      );

      await schedule.update(updates, { transaction });
      return getWorkScheduleByIdService(schedule.id, transaction);
    });
};

export const deleteWorkScheduleService = async (id) => {
  const scheduleId = parseId(id);
  return runSerializableTransaction(async (transaction) => {
    const schedule = await WorkSchedule.findByPk(scheduleId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!schedule) {
      const error = new Error("Không tìm thấy lịch làm việc");
      error.statusCode = 404;
      throw error;
    }

    await ensureNoImpactedAppointmentsForScheduleChange(schedule, null, transaction);
    await schedule.destroy({ transaction });
  });
};