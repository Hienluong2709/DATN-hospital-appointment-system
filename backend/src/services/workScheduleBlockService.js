import { Op, Transaction } from "sequelize";
import db from "../models/index.js";

const { WorkScheduleBlock, Doctor, User, Appointment, WorkSchedule, sequelize } = db;
const SERIALIZATION_ERROR_CODES = new Set(["40001", "40P01"]);
const MAX_SERIALIZABLE_RETRIES = Number(process.env.MAX_SERIALIZABLE_RETRIES) || 2;

const WORK_SCHEDULE_BLOCK_STATUS = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
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

const ensureDateNotInPast = (date) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;

  if (date < today) {
    const error = new Error("Ngày nghỉ không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
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

const normalizeText = (value, fieldName) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    const error = new Error(`${fieldName} không hợp lệ`);
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeReviewStatus = (value) => {
  if (value === WORK_SCHEDULE_BLOCK_STATUS.APPROVED || value === WORK_SCHEDULE_BLOCK_STATUS.REJECTED) {
    return value;
  }

  const error = new Error("status xét duyệt không hợp lệ");
  error.statusCode = 400;
  throw error;
};

const getDayOfWeekFromDate = (date) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
};

const timeToSeconds = (value) => {
  const [hour, minute, second] = value.split(":").map(Number);
  return hour * 3600 + minute * 60 + second;
};

const toTimeString = (value) => (value ? String(value).slice(0, 8) : null);

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

  return doctor;
};

const ensureDoctorIsActive = (doctor) => {
  if (doctor?.status === "Inactive") {
    const error = new Error("Không được tạo yêu cầu nghỉ cho bác sĩ đang ở trạng thái ngừng hoạt động");
    error.statusCode = 409;
    throw error;
  }
};

const ensureBlockFitsDoctorWorkingSchedule = async (
  doctorId,
  date,
  isOff,
  startTime,
  endTime,
  transaction
) => {
  const schedules = await WorkSchedule.findAll({
    where: {
      doctor_id: doctorId,
      day_of_week: getDayOfWeekFromDate(date),
    },
    attributes: ["start_time", "end_time"],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (schedules.length === 0) {
    const error = new Error("Bác sĩ không có lịch làm việc trong ngày đã chọn");
    error.statusCode = 409;
    throw error;
  }

  if (isOff) {
    return;
  }

  const startSeconds = timeToSeconds(startTime);
  const endSeconds = timeToSeconds(endTime);
  const matchesAnySchedule = schedules.some((schedule) => {
    const scheduleStartSeconds = timeToSeconds(toTimeString(schedule.start_time));
    const scheduleEndSeconds = timeToSeconds(toTimeString(schedule.end_time));
    return startSeconds >= scheduleStartSeconds && endSeconds <= scheduleEndSeconds;
  });

  if (!matchesAnySchedule) {
    const error = new Error("Khung nghỉ không nằm trong lịch làm việc của bác sĩ");
    error.statusCode = 409;
    throw error;
  }
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

const ensureDoctorCanEditOwnRequest = (block) => {
  if (
    block.status !== WORK_SCHEDULE_BLOCK_STATUS.PENDING &&
    block.status !== WORK_SCHEDULE_BLOCK_STATUS.REJECTED
  ) {
    const error = new Error("Chỉ có thể chỉnh sửa hoặc rút yêu cầu nghỉ khi chưa được duyệt");
    error.statusCode = 409;
    throw error;
  }
};

const buildActiveBlockWhere = (doctorId, date, excludedBlockId = null) => {
  const where = {
    doctor_id: doctorId,
    date,
    status: {
      [Op.in]: [WORK_SCHEDULE_BLOCK_STATUS.PENDING, WORK_SCHEDULE_BLOCK_STATUS.APPROVED],
    },
  };

  if (excludedBlockId) {
    where.id = { [Op.ne]: excludedBlockId };
  }

  return where;
};

const ensureNoOffDayConflict = async (doctorId, date, options = {}) => {
  const { excludedBlockId = null, transaction } = options;

  const offDayBlock = await WorkScheduleBlock.findOne({
    where: {
      ...buildActiveBlockWhere(doctorId, date, excludedBlockId),
      is_off: true,
    },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (offDayBlock) {
    const error = new Error("Bác sĩ đã có yêu cầu nghỉ cả ngày hoặc lịch nghỉ đã được duyệt");
    error.statusCode = 409;
    throw error;
  }
};

const ensureNoTimeBlockOverlap = async (doctorId, date, startTime, endTime, options = {}) => {
  const { excludedBlockId = null, transaction } = options;

  const overlapped = await WorkScheduleBlock.findOne({
    where: {
      ...buildActiveBlockWhere(doctorId, date, excludedBlockId),
      is_off: false,
      start_time: { [Op.lt]: endTime },
      end_time: { [Op.gt]: startTime },
    },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (overlapped) {
    const error = new Error("Yêu cầu nghỉ bị trùng khung giờ với một yêu cầu hoặc lịch nghỉ khác");
    error.statusCode = 409;
    throw error;
  }
};

const ensureNoOtherBlocksInOffDay = async (doctorId, date, options = {}) => {
  const { excludedBlockId = null, transaction } = options;

  const existing = await WorkScheduleBlock.findOne({
    where: buildActiveBlockWhere(doctorId, date, excludedBlockId),
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (existing) {
    const error = new Error("Không thể đăng ký nghỉ cả ngày khi đã có yêu cầu hoặc lịch nghỉ khác trong ngày");
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
    status: { [Op.notIn]: ["Cancelled", "Completed", "NoShow"] },
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
    const error = new Error("Không thể duyệt lịch nghỉ vì đang có lịch hẹn hoạt động trong khoảng thời gian này");
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
    {
      model: User,
      as: "requestedBy",
      attributes: ["id", "fullname", "username", "role"],
    },
    {
      model: User,
      as: "reviewedBy",
      attributes: ["id", "fullname", "username", "role"],
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

const ensureNoSchedulingConflictForEffectiveBlock = async (
  doctorId,
  date,
  isOff,
  startTime,
  endTime,
  options = {}
) => {
  const { excludedBlockId = null, transaction, enforceAppointmentConflict = false } = options;

  if (isOff) {
    await ensureNoOtherBlocksInOffDay(doctorId, date, { excludedBlockId, transaction });
  } else {
    await ensureNoOffDayConflict(doctorId, date, { excludedBlockId, transaction });
    await ensureNoTimeBlockOverlap(doctorId, date, startTime, endTime, {
      excludedBlockId,
      transaction,
    });
  }

  if (enforceAppointmentConflict) {
    await ensureNoAppointmentConflictWithBlock(
      doctorId,
      date,
      isOff,
      startTime,
      endTime,
      transaction
    );
  }
};

const buildBlockResponse = (blockId, transaction, currentUser) =>
  getWorkScheduleBlockByIdService(blockId, transaction, currentUser);

export const getAllWorkScheduleBlocksService = async (currentUser) => {
  const queryOptions = { ...blockQueryOptions };

  if (currentUser?.role === "DOCTOR") {
    const currentDoctorId = await resolveCurrentDoctorId(currentUser);
    queryOptions.where = { doctor_id: currentDoctorId };
  } else if (currentUser?.role === "RECEPTIONIST") {
    queryOptions.where = { status: WORK_SCHEDULE_BLOCK_STATUS.APPROVED };
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
    const error = new Error("Không tìm thấy lịch nghỉ");
    error.statusCode = 404;
    throw error;
  }

  if (currentUser?.role === "DOCTOR") {
    const currentDoctorId = await resolveCurrentDoctorId(currentUser, transaction);
    ensureDoctorOwnsBlock(block, currentDoctorId);
  } else if (
    currentUser?.role === "RECEPTIONIST" &&
    block.status !== WORK_SCHEDULE_BLOCK_STATUS.APPROVED
  ) {
    const error = new Error("Bạn không có quyền xem yêu cầu nghỉ chưa được duyệt");
    error.statusCode = 403;
    throw error;
  }

  return block;
};

export const createWorkScheduleBlockService = async (payload, currentUser) => {
  if (currentUser?.role !== "DOCTOR") {
    const error = new Error("Chỉ bác sĩ mới được đăng ký lịch nghỉ");
    error.statusCode = 403;
    throw error;
  }

  const safePayload = payload || {};

  return runSerializableTransaction(async (transaction) => {
    const currentDoctorId = await resolveCurrentDoctorId(currentUser, transaction);
    const doctor = await ensureDoctorExists(currentDoctorId, transaction);
    ensureDoctorIsActive(doctor);
    const doctorId = doctor.id;
    const date = normalizeDate(safePayload.date);
    ensureDateNotInPast(date);
    const reason = normalizeText(safePayload.reason, "reason");
    const { isOff, startTime, endTime } = resolveBlockPayload(safePayload);

    await ensureBlockFitsDoctorWorkingSchedule(
      doctorId,
      date,
      isOff,
      startTime,
      endTime,
      transaction
    );

    await ensureNoSchedulingConflictForEffectiveBlock(doctorId, date, isOff, startTime, endTime, {
      transaction,
    });

    const created = await WorkScheduleBlock.create(
      {
        doctor_id: doctorId,
        requested_by_user_id: currentUser.id,
        reviewed_by_user_id: null,
        date,
        status: WORK_SCHEDULE_BLOCK_STATUS.PENDING,
        is_off: isOff,
        start_time: startTime,
        end_time: endTime,
        reason,
        reviewed_at: null,
        review_note: null,
      },
      { transaction }
    );

    return buildBlockResponse(created.id, transaction, currentUser);
  });
};

export const updateWorkScheduleBlockService = async (id, payload, currentUser) => {
  if (currentUser?.role !== "DOCTOR") {
    const error = new Error("Chỉ bác sĩ mới được cập nhật yêu cầu nghỉ của mình");
    error.statusCode = 403;
    throw error;
  }

  const blockId = parseId(id);
  const safePayload = payload || {};
  const allowedUpdateFields = ["date", "reason", "is_off", "start_time", "end_time"];
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
      const error = new Error("Không tìm thấy lịch nghỉ");
      error.statusCode = 404;
      throw error;
    }

    ensureDoctorOwnsBlock(block, currentDoctorId);
    ensureDoctorCanEditOwnRequest(block);
    const doctor = await ensureDoctorExists(currentDoctorId, transaction);
    ensureDoctorIsActive(doctor);

    if (Object.keys(safePayload).length === 0 || !hasRecognizedField) {
      const error = new Error("Không có dữ liệu để cập nhật");
      error.statusCode = 400;
      throw error;
    }

    const updates = {
      doctor_id: currentDoctorId,
      requested_by_user_id: currentUser.id,
      status: WORK_SCHEDULE_BLOCK_STATUS.PENDING,
      reviewed_by_user_id: null,
      reviewed_at: null,
      review_note: null,
    };

    if (Object.prototype.hasOwnProperty.call(safePayload, "date")) {
      updates.date = normalizeDate(safePayload.date);
    }

    if (Object.prototype.hasOwnProperty.call(safePayload, "reason")) {
      updates.reason = normalizeText(safePayload.reason, "reason");
    }

    const effectiveDate = updates.date !== undefined ? updates.date : block.date;
    ensureDateNotInPast(effectiveDate);
    const { isOff, startTime, endTime } = resolveBlockPayload(safePayload, block);

    updates.is_off = isOff;
    updates.start_time = startTime;
    updates.end_time = endTime;

    const hasEffectiveChange =
      updates.date !== block.date ||
      updates.reason !== block.reason ||
      updates.is_off !== block.is_off ||
      toTimeString(updates.start_time) !== toTimeString(block.start_time) ||
      toTimeString(updates.end_time) !== toTimeString(block.end_time) ||
      block.status !== WORK_SCHEDULE_BLOCK_STATUS.PENDING ||
      block.reviewed_by_user_id !== null ||
      block.reviewed_at !== null ||
      block.review_note !== null;

    if (!hasEffectiveChange) {
      const error = new Error("Không có thay đổi dữ liệu hợp lệ để cập nhật");
      error.statusCode = 400;
      throw error;
    }

    await ensureBlockFitsDoctorWorkingSchedule(
      currentDoctorId,
      effectiveDate,
      isOff,
      startTime,
      endTime,
      transaction
    );

    await ensureNoSchedulingConflictForEffectiveBlock(
      currentDoctorId,
      effectiveDate,
      isOff,
      startTime,
      endTime,
      {
        excludedBlockId: block.id,
        transaction,
      }
    );

    await block.update(updates, { transaction });
    return buildBlockResponse(block.id, transaction, currentUser);
  });
};

export const reviewWorkScheduleBlockService = async (id, payload, currentUser) => {
  const blockId = parseId(id);
  const safePayload = payload || {};

  return runSerializableTransaction(async (transaction) => {
    const block = await WorkScheduleBlock.findByPk(blockId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!block) {
      const error = new Error("Không tìm thấy lịch nghỉ");
      error.statusCode = 404;
      throw error;
    }

    if (block.status !== WORK_SCHEDULE_BLOCK_STATUS.PENDING) {
      const error = new Error("Chỉ có thể duyệt hoặc từ chối yêu cầu đang chờ duyệt");
      error.statusCode = 409;
      throw error;
    }

    const nextStatus = normalizeReviewStatus(safePayload.status);
    const reviewNote = normalizeText(safePayload.review_note, "review_note");

    if (nextStatus === WORK_SCHEDULE_BLOCK_STATUS.APPROVED) {
      await ensureNoSchedulingConflictForEffectiveBlock(
        block.doctor_id,
        block.date,
        block.is_off,
        block.start_time,
        block.end_time,
        {
          excludedBlockId: block.id,
          transaction,
          enforceAppointmentConflict: true,
        }
      );
    }

    await block.update(
      {
        status: nextStatus,
        reviewed_by_user_id: currentUser.id,
        reviewed_at: new Date(),
        review_note: reviewNote,
      },
      { transaction }
    );

    return buildBlockResponse(block.id, transaction, currentUser);
  });
};

export const deleteWorkScheduleBlockService = async (id, currentUser) => {
  if (currentUser?.role !== "DOCTOR") {
    const error = new Error("Chỉ bác sĩ mới được rút yêu cầu nghỉ của mình");
    error.statusCode = 403;
    throw error;
  }

  const blockId = parseId(id);

  return runSerializableTransaction(async (transaction) => {
    const currentDoctorId = await resolveCurrentDoctorId(currentUser, transaction);
    const block = await WorkScheduleBlock.findByPk(blockId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!block) {
      const error = new Error("Không tìm thấy lịch nghỉ");
      error.statusCode = 404;
      throw error;
    }

    if (currentDoctorId) {
      ensureDoctorOwnsBlock(block, currentDoctorId);
      ensureDoctorCanEditOwnRequest(block);
    }

    await block.destroy({ transaction });
  });
};
