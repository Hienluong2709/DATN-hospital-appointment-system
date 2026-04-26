import db from "../models/index.js";

const { Room, Specialty, Doctor } = db;

const ALLOWED_ROOM_STATUS = ["Available", "Maintenance"];

const parseId = (id) => {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error("ID không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  return parsed;
};

const normalizeName = (name) => {
  if (typeof name !== "string") {
    const error = new Error("Tên phòng là bắt buộc");
    error.statusCode = 400;
    throw error;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    const error = new Error("Tên phòng là bắt buộc");
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

const normalizeFloor = (floor) => {
  if (floor === undefined || floor === null || floor === "") {
    return null;
  }

  const parsed = Number(floor);
  if (!Number.isInteger(parsed) || parsed < 0) {
    const error = new Error("Tầng phải là số nguyên không âm");
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

const normalizeStatus = (status) => {
  if (status === undefined || status === null || status === "") {
    return undefined;
  }

  if (!ALLOWED_ROOM_STATUS.includes(status)) {
    const error = new Error("Trạng thái phòng không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return status;
};

const ensureSpecialtyExists = async (specialtyId) => {
  const parsedSpecialtyId = parseId(specialtyId);
  const specialty = await Specialty.findByPk(parsedSpecialtyId);

  if (!specialty) {
    const error = new Error("Không tìm thấy chuyên khoa");
    error.statusCode = 404;
    throw error;
  }

  return parsedSpecialtyId;
};

const roomQueryOptions = {
  include: [
    {
      model: Specialty,
      attributes: ["id", "name"],
    },
  ],
  order: [["id", "ASC"]],
};

export const getAllRoomsService = async () => {
  return Room.findAll(roomQueryOptions);
};

export const getRoomByIdService = async (id) => {
  const roomId = parseId(id);
  const room = await Room.findByPk(roomId, {
    include: roomQueryOptions.include,
  });

  if (!room) {
    const error = new Error("Không tìm thấy phòng");
    error.statusCode = 404;
    throw error;
  }

  return room;
};

export const createRoomService = async (payload) => {
  const normalizedName = normalizeName(payload?.name);
  const normalizedFloor = normalizeFloor(payload?.floor);
  const normalizedSpecialtyId = await ensureSpecialtyExists(payload?.specialty_id);
  const normalizedStatus = normalizeStatus(payload?.status);
  const normalizedDescription = payload?.description?.trim() || null;

  const existed = await Room.findOne({ where: { name: normalizedName } });
  if (existed) {
    const error = new Error("Tên phòng đã tồn tại");
    error.statusCode = 409;
    throw error;
  }

  const created = await Room.create({
    name: normalizedName,
    floor: normalizedFloor,
    specialty_id: normalizedSpecialtyId,
    status: normalizedStatus,
    description: normalizedDescription,
  });

  return getRoomByIdService(created.id);
};

export const updateRoomService = async (id, payload) => {
  const roomId = parseId(id);
  const room = await Room.findByPk(roomId);

  if (!room) {
    const error = new Error("Không tìm thấy phòng");
    error.statusCode = 404;
    throw error;
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    const normalizedName = normalizeName(payload.name);
    const duplicate = await Room.findOne({ where: { name: normalizedName } });

    if (duplicate && duplicate.id !== room.id) {
      const error = new Error("Tên phòng đã tồn tại");
      error.statusCode = 409;
      throw error;
    }

    updates.name = normalizedName;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "floor")) {
    updates.floor = normalizeFloor(payload.floor);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "specialty_id")) {
    updates.specialty_id = await ensureSpecialtyExists(payload.specialty_id);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    updates.status = normalizeStatus(payload.status);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "description")) {
    updates.description = payload.description?.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    const error = new Error("Không có dữ liệu để cập nhật");
    error.statusCode = 400;
    throw error;
  }

  await room.update(updates);
  return getRoomByIdService(room.id);
};

export const deleteRoomService = async (id) => {
  const roomId = parseId(id);
  const room = await Room.findByPk(roomId);

  if (!room) {
    const error = new Error("Không tìm thấy phòng");
    error.statusCode = 404;
    throw error;
  }

  const doctorCount = await Doctor.count({ where: { room_id: roomId } });
  if (doctorCount > 0) {
    const error = new Error("Không thể xóa phòng đang được bác sĩ sử dụng");
    error.statusCode = 409;
    throw error;
  }

  await room.destroy();
};
