import db from "../models/index.js";
import {
  buildPaginationMeta,
  createPaginatedListResult,
  createListResult,
  filterItemsByLooseSearch,
  normalizeOptionalQueryString,
  parsePaginationQuery,
} from "../utils/queryUtils.js";

const { Specialty, Doctor, Room } = db;

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
    const error = new Error("Tên chuyên khoa là bắt buộc");
    error.statusCode = 400;
    throw error;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    const error = new Error("Tên chuyên khoa là bắt buộc");
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

export const getAllSpecialtiesService = async (filters = {}) => {
  const pagination = parsePaginationQuery(filters);
  const q = normalizeOptionalQueryString(filters?.q);
  const where = {};

  if (!q && !pagination.enabled) {
    const items = await Specialty.findAll({
      where,
      order: [["id", "ASC"]],
    });

    return createListResult({
      items,
      pagination: null,
    });
  }

  if (!q && pagination.enabled) {
    const { rows, count } = await Specialty.findAndCountAll({
      where,
      order: [["id", "ASC"]],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return createListResult({
      items: rows,
      pagination: buildPaginationMeta({
        page: pagination.page,
        page_size: pagination.page_size,
        total_items: count,
      }),
    });
  }

  const items = await Specialty.findAll({
    where,
    order: [["id", "ASC"]],
  });

  const filteredItems = filterItemsByLooseSearch(items, q, (specialty) => [
    specialty.name,
    specialty.description,
  ]);

  return createPaginatedListResult({
    items: filteredItems,
    pagination,
  });
};

export const getSpecialtyByIdService = async (id) => {
  const specialtyId = parseId(id);
  const specialty = await Specialty.findByPk(specialtyId);

  if (!specialty) {
    const error = new Error("Không tìm thấy chuyên khoa");
    error.statusCode = 404;
    throw error;
  }

  return specialty;
};

export const createSpecialtyService = async (payload) => {
  const normalizedName = normalizeName(payload?.name);
  const normalizedDescription = payload?.description?.trim() || null;

  const existed = await Specialty.findOne({
    where: { name: normalizedName },
  });

  if (existed) {
    const error = new Error("Chuyên khoa đã tồn tại");
    error.statusCode = 409;
    throw error;
  }

  return Specialty.create({
    name: normalizedName,
    description: normalizedDescription,
  });
};

export const updateSpecialtyService = async (id, payload) => {
  const specialtyId = parseId(id);
  const specialty = await Specialty.findByPk(specialtyId);

  if (!specialty) {
    const error = new Error("Không tìm thấy chuyên khoa");
    error.statusCode = 404;
    throw error;
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    const normalizedName = normalizeName(payload.name);

    const duplicate = await Specialty.findOne({
      where: { name: normalizedName },
    });

    if (duplicate && duplicate.id !== specialty.id) {
      const error = new Error("Tên chuyên khoa đã được sử dụng");
      error.statusCode = 409;
      throw error;
    }

    updates.name = normalizedName;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "description")) {
    updates.description = payload.description?.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    const error = new Error("Không có dữ liệu để cập nhật");
    error.statusCode = 400;
    throw error;
  }

  await specialty.update(updates);
  return specialty;
};

export const deleteSpecialtyService = async (id) => {
  const specialtyId = parseId(id);
  const specialty = await Specialty.findByPk(specialtyId);

  if (!specialty) {
    const error = new Error("Không tìm thấy chuyên khoa");
    error.statusCode = 404;
    throw error;
  }

  const [doctorCount, roomCount] = await Promise.all([
    Doctor.count({ where: { specialty_id: specialtyId } }),
    Room.count({ where: { specialty_id: specialtyId } }),
  ]);

  if (doctorCount > 0 || roomCount > 0) {
    const error = new Error("Không thể xóa chuyên khoa đang được sử dụng");
    error.statusCode = 409;
    throw error;
  }

  await specialty.destroy();
};
