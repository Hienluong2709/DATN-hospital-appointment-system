import { Op, Transaction } from "sequelize";
import db from "../models/index.js";

const { WorkScheduleBlock, Doctor, User, Appointment, sequelize } = db;
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

  const [year, month, day] = trimmed.split("-").map(Number);
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

  return trimmed;
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

  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
};

const normalizeBoolean = (value, fieldName) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") {
      return true;
    }

    if (lowered === "false") {
      return false;
    }
  }

  const error = new Error(`${fieldName} phải là boolean`);
  error.statusCode = 400;
  throw error;
};

const normalizeReason = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    const error = new Error("reason không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  return trimmed || null;
};

const timeToSeconds = (value) => {
  const [hour, minute, second] = value.split(":").map(Number);
  return hour * 3600 + minute * 60 + second;
};

const toTimeString = (value) => String(value).slice(0, 8);

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

const resolveCurrentDoctorId = async (currentUser, transaction) => {
  if (currentUser?.role !== "DOCTOR") {
    return null;
  }

  const doctor = await Doctor.findOne({
    where: { user_id: currentUser.id },
    attributes: ["id"],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (!doctor) {
    const error = new Error("Không tìm thấy hồ sơ bác sĩ của tài khoản hiện tại");
    error.statusCode = 403;
    throw error;
  }

  return doctor.id;
};

const ensureDoctorOwnsBlock = (block, currentDoctorId) => {
  if (currentDoctorId && block.doctor_id !== currentDoctorId) {
    const error = new Error("Bạn không có quyền thao tác lịch nghỉ của bác sĩ khác");
    error.statusCode = 403;
    throw error;
  }
};

const ensureNoOffDayConflict = async (doctorId, date, options = {}) => {
  const { excludedBlockId = null, transaction } = options;
  const where = {
    doctor_id: doctorId,
    date,
    is_off: true,
  };

  if (excludedBlockId) {
    where.id = { [Op.ne]: excludedBlockId };
  }

  const offDayBlock = await WorkScheduleBlock.findOne({
    where,
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (offDayBlock) {
    const error = new Error("Bác sĩ đã được đánh dấu nghỉ cả ngày");
    error.statusCode = 409;
    throw error;
  }
};

const ensureNoTimeBlockOverlap = async (doctorId, date, startTime, endTime, options = {}) => {
  const { excludedBlockId = null, transaction } = options;
  const where = {
    doctor_id: doctorId,
    date,
    is_off: false,
    start_time: { [Op.lt]: endTime },
    end_time: { [Op.gt]: startTime },
  };

  if (excludedBlockId) {
    where.id = { [Op.ne]: excludedBlockId };
  }

  const overlapped = await WorkScheduleBlock.findOne({
    where,
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (overlapped) {
    const error = new Error("Block time bị trùng khung giờ trong ngày này");
    error.statusCode = 409;
    throw error;
  }
};

const ensureNoOtherBlocksInOffDay = async (doctorId, date, options = {}) => {
  const { excludedBlockId = null, transaction } = options;
  const where = {
    doctor_id: doctorId,
    date,
  };

  if (excludedBlockId) {
    where.id = { [Op.ne]: excludedBlockId };
  }

  const existing = await WorkScheduleBlock.findOne({
    where,
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (existing) {
    const error = new Error("Không thể đánh dấu nghỉ cả ngày khi đã có block time trong ngày");
    error.statusCode = 409;
    throw error;
  }
};

const ensureNoAppointmentConflictWithBlock = async (
  doctorId,
  date,
  isOff,
  startTime,
  endTime,
  transaction
) => {
  const where = {
    doctor_id: doctorId,
    date,
    status: { [Op.ne]: "Cancelled" },
  };

  if (!isOff) {
    where.time_slot = {
      [Op.gte]: startTime,
      [Op.lt]: endTime,
    };
  }

  const conflictingAppointment = await Appointment.findOne({
    where,
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (conflictingAppointment) {
    const error = new Error("Không thể block vì đang có lịch hẹn đã được đặt trong khoảng thời gian này");
    error.statusCode = 409;
    throw error;
  }
};

const blockQueryOptions = {
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
    ["date", "ASC"],
    ["start_time", "ASC"],
    ["id", "ASC"],
  ],
};

const resolveBlockPayload = (payload, currentBlock = null) => {
  const hasIsOff = Object.prototype.hasOwnProperty.call(payload, "is_off");

  const isOff = hasIsOff
    ? normalizeBoolean(payload.is_off, "is_off")
    : currentBlock
      ? currentBlock.is_off
      : false;

  const hasStart = Object.prototype.hasOwnProperty.call(payload, "start_time");
  const hasEnd = Object.prototype.hasOwnProperty.call(payload, "end_time");

  let startTime = currentBlock ? currentBlock.start_time : null;
  let endTime = currentBlock ? currentBlock.end_time : null;

  if (isOff) {
    startTime = null;
    endTime = null;
  } else {
    if (hasStart) {
      startTime = payload.start_time === null ? null : normalizeTime(payload.start_time, "start_time");
    }

    if (hasEnd) {
      endTime = payload.end_time === null ? null : normalizeTime(payload.end_time, "end_time");
    }

    if (!startTime || !endTime) {
      const error = new Error("Block time phải có đầy đủ start_time và end_time khi is_off=false");
      error.statusCode = 400;
      throw error;
    }

    ensureStartBeforeEnd(startTime, endTime);
  }

  return { isOff, startTime, endTime };
};

export const getAllWorkScheduleBlocksService = async (currentUser) => {
  const queryOptions = { ...blockQueryOptions };

  if (currentUser?.role === "DOCTOR") {
    const currentDoctorId = await resolveCurrentDoctorId(currentUser);
    queryOptions.where = { doctor_id: currentDoctorId };
  }

  return WorkScheduleBlock.findAll(queryOptions);
};

export const getWorkScheduleBlockByIdService = async (id, transaction, currentUser) => {
  const blockId = parseId(id);
  const block = await WorkScheduleBlock.findByPk(blockId, {
    include: blockQueryOptions.include,
    transaction,
  });

  if (!block) {
    const error = new Error("Không tìm thấy work schedule block");
    error.statusCode = 404;
    throw error;
  }

  if (currentUser?.role === "DOCTOR") {
    const currentDoctorId = await resolveCurrentDoctorId(currentUser, transaction);
    ensureDoctorOwnsBlock(block, currentDoctorId);
  }

  return block;
};

export const createWorkScheduleBlockService = async (payload, currentUser) => {
  const safePayload = payload || {};

  return runSerializableTransaction(async (transaction) => {
      const currentDoctorId = await resolveCurrentDoctorId(currentUser, transaction);
      const requestedDoctorId = currentDoctorId || safePayload.doctor_id;
      const doctorId = await ensureDoctorExists(requestedDoctorId, transaction);
      const date = normalizeDate(safePayload.date);
      const reason = normalizeReason(safePayload.reason);
      const { isOff, startTime, endTime } = resolveBlockPayload(safePayload);

      if (isOff) {
        await ensureNoOtherBlocksInOffDay(doctorId, date, { transaction });
      } else {
        await ensureNoOffDayConflict(doctorId, date, { transaction });
        await ensureNoTimeBlockOverlap(doctorId, date, startTime, endTime, { transaction });
      }

      await ensureNoAppointmentConflictWithBlock(
        doctorId,
        date,
        isOff,
        startTime,
        endTime,
        transaction
      );

      const created = await WorkScheduleBlock.create(
        {
          doctor_id: doctorId,
          date,
          is_off: isOff,
          start_time: startTime,
          end_time: endTime,
          reason,
        },
        { transaction }
      );

      return getWorkScheduleBlockByIdService(created.id, transaction, currentUser);
    });
};

    export const updateWorkScheduleBlockService = async (id, payload, currentUser) => {
  const blockId = parseId(id);
  const safePayload = payload || {};
  const allowedUpdateFields = ["doctor_id", "date", "reason", "is_off", "start_time", "end_time"];
  const hasRecognizedField = allowedUpdateFields.some((field) =>
    Object.prototype.hasOwnProperty.call(safePayload, field)
  );

  return runSerializableTransaction(async (transaction) => {
      const currentDoctorId = await resolveCurrentDoctorId(currentUser, transaction);
      const block = await WorkScheduleBlock.findByPk(blockId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!block) {
        const error = new Error("Không tìm thấy work schedule block");
        error.statusCode = 404;
        throw error;
      }

      ensureDoctorOwnsBlock(block, currentDoctorId);

      if (Object.keys(safePayload).length === 0 || !hasRecognizedField) {
        const error = new Error("Không có dữ liệu để cập nhật");
        error.statusCode = 400;
        throw error;
      }

      const updates = {};

      if (currentDoctorId) {
        updates.doctor_id = currentDoctorId;
      } else if (Object.prototype.hasOwnProperty.call(safePayload, "doctor_id")) {
        updates.doctor_id = await ensureDoctorExists(safePayload.doctor_id, transaction);
      }

      if (Object.prototype.hasOwnProperty.call(safePayload, "date")) {
        updates.date = normalizeDate(safePayload.date);
      }

      if (Object.prototype.hasOwnProperty.call(safePayload, "reason")) {
        updates.reason = normalizeReason(safePayload.reason);
      }

      const effectiveDoctorId =
        updates.doctor_id !== undefined ? updates.doctor_id : block.doctor_id;
      const effectiveDate = updates.date !== undefined ? updates.date : block.date;

      const { isOff, startTime, endTime } = resolveBlockPayload(safePayload, block);

      updates.is_off = isOff;
      updates.start_time = startTime;
      updates.end_time = endTime;

      const hasEffectiveChange =
        updates.doctor_id !== block.doctor_id ||
        updates.date !== block.date ||
        updates.reason !== block.reason ||
        updates.is_off !== block.is_off ||
        toTimeString(updates.start_time) !== toTimeString(block.start_time) ||
        toTimeString(updates.end_time) !== toTimeString(block.end_time);

      if (!hasEffectiveChange) {
        const error = new Error("Không có thay đổi dữ liệu hợp lệ để cập nhật");
        error.statusCode = 400;
        throw error;
      }

      if (isOff) {
        await ensureNoOtherBlocksInOffDay(effectiveDoctorId, effectiveDate, {
          excludedBlockId: block.id,
          transaction,
        });
      } else {
        await ensureNoOffDayConflict(effectiveDoctorId, effectiveDate, {
          excludedBlockId: block.id,
          transaction,
        });

        await ensureNoTimeBlockOverlap(effectiveDoctorId, effectiveDate, startTime, endTime, {
          excludedBlockId: block.id,
          transaction,
        });
      }

      await ensureNoAppointmentConflictWithBlock(
        effectiveDoctorId,
        effectiveDate,
        isOff,
        startTime,
        endTime,
        transaction
      );

      await block.update(updates, { transaction });
      return getWorkScheduleBlockByIdService(block.id, transaction, currentUser);
    });
};

export const deleteWorkScheduleBlockService = async (id, currentUser) => {
  const blockId = parseId(id);
  return runSerializableTransaction(async (transaction) => {
    const currentDoctorId = await resolveCurrentDoctorId(currentUser, transaction);
    const block = await WorkScheduleBlock.findByPk(blockId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!block) {
      const error = new Error("Không tìm thấy work schedule block");
      error.statusCode = 404;
      throw error;
    }

    ensureDoctorOwnsBlock(block, currentDoctorId);

    await block.destroy({ transaction });
  });
};
