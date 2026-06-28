import db from "../models/index.js";

const { EQueueNumber } = db;

const parseId = (id) => {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error("ID không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  return parsed;
};

const normalizeDoctorId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error("doctor_id là bắt buộc và phải là số nguyên dương");
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

  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    const error = new Error("date không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

const normalizeCurrentNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    const error = new Error("current_number phải là số nguyên không âm");
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

const formatDateUTC = (dateValue) => {
  return dateValue.toISOString().slice(0, 10);
};

export const getAllEQueueNumbersService = async () => {
  return EQueueNumber.findAll({
    order: [
      ["date", "ASC"],
      ["doctor_id", "ASC"],
      ["id", "ASC"],
    ],
  });
};

export const getEQueueNumberByIdService = async (id) => {
  const rowId = parseId(id);
  const row = await EQueueNumber.findByPk(rowId);

  if (!row) {
    const error = new Error("Không tìm thấy bộ đếm số thứ tự");
    error.statusCode = 404;
    throw error;
  }

  return row;
};

export const getEQueueNumberByDateService = async (date, doctorId) => {
  const normalizedDate = normalizeDate(date);
  const normalizedDoctorId = normalizeDoctorId(doctorId);
  const row = await EQueueNumber.findOne({
    where: { date: normalizedDate, doctor_id: normalizedDoctorId },
  });

  if (!row) {
    const error = new Error("Không tìm thấy bộ đếm theo ngày và bác sĩ");
    error.statusCode = 404;
    throw error;
  }

  return row;
};

export const createEQueueNumberService = async (payload) => {
  const normalizedDoctorId = normalizeDoctorId(payload?.doctor_id);
  const normalizedDate = normalizeDate(payload?.date);
  const normalizedCurrentNumber = normalizeCurrentNumber(payload?.current_number);

  const existed = await EQueueNumber.findOne({
    where: { date: normalizedDate, doctor_id: normalizedDoctorId },
  });
  if (existed) {
    const error = new Error("Bác sĩ này đã có bộ đếm số thứ tự trong ngày");
    error.statusCode = 409;
    throw error;
  }

  return EQueueNumber.create({
    doctor_id: normalizedDoctorId,
    date: normalizedDate,
    current_number: normalizedCurrentNumber,
  });
};

export const updateEQueueNumberService = async (id, payload) => {
  const rowId = parseId(id);
  const row = await EQueueNumber.findByPk(rowId);

  if (!row) {
    const error = new Error("Không tìm thấy bộ đếm số thứ tự");
    error.statusCode = 404;
    throw error;
  }

  const updates = {};

  const targetDoctorId = Object.prototype.hasOwnProperty.call(payload, "doctor_id")
    ? normalizeDoctorId(payload.doctor_id)
    : row.doctor_id;

  if (Object.prototype.hasOwnProperty.call(payload, "doctor_id")) {
    updates.doctor_id = targetDoctorId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "date")) {
    const normalizedDate = normalizeDate(payload.date);
    const duplicate = await EQueueNumber.findOne({
      where: { date: normalizedDate, doctor_id: targetDoctorId },
    });

    if (duplicate && duplicate.id !== row.id) {
      const error = new Error("Bác sĩ này đã có bộ đếm số thứ tự trong ngày");
      error.statusCode = 409;
      throw error;
    }

    updates.date = normalizedDate;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "current_number")) {
    updates.current_number = normalizeCurrentNumber(payload.current_number);
  }

  if (Object.keys(updates).length === 0) {
    const error = new Error("Không có dữ liệu để cập nhật");
    error.statusCode = 400;
    throw error;
  }

  await row.update(updates);
  return row;
};

export const deleteEQueueNumberService = async (id) => {
  const rowId = parseId(id);
  const row = await EQueueNumber.findByPk(rowId);

  if (!row) {
    const error = new Error("Không tìm thấy bộ đếm số thứ tự");
    error.statusCode = 404;
    throw error;
  }

  await row.destroy();
};

export const resetEQueueNumberService = async (payload) => {
  const normalizedDoctorId = normalizeDoctorId(payload?.doctor_id);
  const normalizedDate = payload?.date
    ? normalizeDate(payload.date)
    : formatDateUTC(new Date());
  const resetNumber =
    payload && Object.prototype.hasOwnProperty.call(payload, "current_number")
      ? normalizeCurrentNumber(payload.current_number)
      : 0;

  const [row, created] = await EQueueNumber.findOrCreate({
    where: { date: normalizedDate, doctor_id: normalizedDoctorId },
    defaults: {
      doctor_id: normalizedDoctorId,
      date: normalizedDate,
      current_number: resetNumber,
    },
  });

  if (!created) {
    await row.update({ current_number: resetNumber });
  }

  return row;
};