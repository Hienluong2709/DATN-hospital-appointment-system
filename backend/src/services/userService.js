import bcrypt from "bcrypt";
import { Op } from "sequelize";
import db from "../models/index.js";
import {
  buildPaginationMeta,
  createPaginatedListResult,
  createListResult,
  filterItemsByLooseSearch,
  normalizeOptionalQueryString,
  parsePaginationQuery,
} from "../utils/queryUtils.js";

const { User } = db;

const ALLOWED_ROLES = ["ADMIN", "DOCTOR", "PATIENT", "RECEPTIONIST"];
const ALLOWED_GENDERS = ["MALE", "FEMALE", "OTHER"];

const parseId = (id) => {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error("ID không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

const normalizeRequiredString = (value, fieldName) => {
  if (typeof value !== "string") {
    const error = new Error(`${fieldName} là bắt buộc`);
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    const error = new Error(`${fieldName} là bắt buộc`);
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    const error = new Error("Giá trị không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeOptionalPhone = (value) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const digits = normalized.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) {
    return digits;
  }

  if (digits.startsWith("84") && digits.length === 11) {
    return `0${digits.slice(2)}`;
  }

  const error = new Error("Số điện thoại không hợp lệ");
  error.statusCode = 400;
  throw error;
};

const normalizeRole = (role) => {
  if (role === undefined || role === null || role === "") {
    return "PATIENT";
  }

  if (!ALLOWED_ROLES.includes(role)) {
    const error = new Error("Role không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return role;
};

const normalizeOptionalDateOnly = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    const error = new Error(`${fieldName} không hợp lệ`);
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const error = new Error(`${fieldName} không hợp lệ`);
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

const normalizeOptionalGender = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !ALLOWED_GENDERS.includes(value)) {
    const error = new Error("Giới tính không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return value;
};

const sanitizeUser = (user) => ({
  id: user.id,
  username: user.username,
  fullname: user.fullname,
  email: user.email,
  phone: user.phone,
  date_of_birth: user.date_of_birth,
  gender: user.gender,
  address: user.address,
  role: user.role,
});

const ensureUniqueUserContacts = async ({ userId = null, email, phone, username }) => {
  const conditions = [
    ...(username ? [{ username }] : []),
    ...(email ? [{ email }] : []),
    ...(phone ? [{ phone }] : []),
  ];

  if (conditions.length === 0) {
    return;
  }

  const existed = await User.findOne({
    where: {
      [Op.and]: [
        {
          [Op.or]: conditions,
        },
        ...(userId ? [{ id: { [Op.ne]: userId } }] : []),
      ],
    },
  });

  if (!existed) {
    return;
  }

  let message = "Thông tin người dùng đã tồn tại";
  if (username && existed.username === username) {
    message = "Username đã tồn tại";
  } else if (email && existed.email === email) {
    message = "Email đã tồn tại";
  } else if (phone && existed.phone === phone) {
    message = "Số điện thoại đã tồn tại";
  }

  const error = new Error(message);
  error.statusCode = 409;
  throw error;
};

export const getAllUsersService = async (filters = {}) => {
  const pagination = parsePaginationQuery(filters);
  const q = normalizeOptionalQueryString(filters?.q);
  const role = normalizeOptionalQueryString(filters?.role, 30);
  const gender = normalizeOptionalQueryString(filters?.gender, 30);
  const where = {};

  if (role) {
    where.role = normalizeRole(role);
  }

  if (gender) {
    where.gender = normalizeOptionalGender(gender);
  }

  if (!q && !pagination.enabled) {
    const users = await User.findAll({
      where,
      order: [["id", "ASC"]],
    });

    return createListResult({
      items: users.map(sanitizeUser),
      pagination: null,
    });
  }

  if (!q && pagination.enabled) {
    const { rows, count } = await User.findAndCountAll({
      where,
      order: [["id", "ASC"]],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return createListResult({
      items: rows.map(sanitizeUser),
      pagination: buildPaginationMeta({
        page: pagination.page,
        page_size: pagination.page_size,
        total_items: count,
      }),
    });
  }

  const users = await User.findAll({
    where,
    order: [["id", "ASC"]],
  });

  const filteredUsers = filterItemsByLooseSearch(users, q, (user) => [
    user.username,
    user.fullname,
    user.email,
    user.phone,
  ]);

  return createPaginatedListResult({
    items: filteredUsers.map(sanitizeUser),
    pagination,
  });
};

export const getUserByIdService = async (id) => {
  const parsedId = parseId(id);
  const user = await User.findByPk(parsedId);

  if (!user) {
    const error = new Error("Không tìm thấy người dùng");
    error.statusCode = 404;
    throw error;
  }

  return sanitizeUser(user);
};

export const getCurrentUserService = async (currentUser) => {
  const parsedId = parseId(currentUser?.id);
  const user = await User.findByPk(parsedId);

  if (!user) {
    const error = new Error("Không tìm thấy người dùng");
    error.statusCode = 404;
    throw error;
  }

  return sanitizeUser(user);
};

export const createUserService = async (payload) => {
  const username = normalizeRequiredString(payload?.username, "Username");
  const password = normalizeRequiredString(payload?.password, "Password");
  const fullname = normalizeRequiredString(payload?.fullname, "Fullname");
  const email = normalizeOptionalString(payload?.email);
  const phone = normalizeOptionalPhone(payload?.phone);
  const date_of_birth = normalizeOptionalDateOnly(payload?.date_of_birth, "Ngày sinh");
  const gender = normalizeOptionalGender(payload?.gender);
  const address = normalizeOptionalString(payload?.address);
  const role = normalizeRole(payload?.role);

  if (password.length < 6) {
    const error = new Error("Password phải có ít nhất 6 ký tự");
    error.statusCode = 400;
    throw error;
  }

  await ensureUniqueUserContacts({ username, email, phone });

  const created = await User.create({
    username,
    password,
    fullname,
    email,
    phone,
    date_of_birth,
    gender,
    address,
    role,
  });

  return sanitizeUser(created);
};

export const updateUserService = async (id, payload) => {
  const parsedId = parseId(id);
  const user = await User.findByPk(parsedId);

  if (!user) {
    const error = new Error("Không tìm thấy người dùng");
    error.statusCode = 404;
    throw error;
  }

  const username = normalizeRequiredString(payload?.username, "Username");
  const fullname = normalizeRequiredString(payload?.fullname, "Fullname");
  const email = normalizeOptionalString(payload?.email);
  const phone = normalizeOptionalPhone(payload?.phone);
  const date_of_birth = normalizeOptionalDateOnly(payload?.date_of_birth, "Ngày sinh");
  const gender = normalizeOptionalGender(payload?.gender);
  const address = normalizeOptionalString(payload?.address);
  const role = normalizeRole(payload?.role);
  const rawPassword = payload?.password;

  await ensureUniqueUserContacts({
    userId: user.id,
    username,
    email,
    phone,
  });

  user.username = username;
  user.fullname = fullname;
  user.email = email;
  user.phone = phone;
  user.date_of_birth = date_of_birth;
  user.gender = gender;
  user.address = address;
  user.role = role;

  if (rawPassword !== undefined && rawPassword !== null) {
    if (typeof rawPassword !== "string") {
      const error = new Error("Password không hợp lệ");
      error.statusCode = 400;
      throw error;
    }

    const password = rawPassword.trim();
    if (password) {
      if (password.length < 6) {
        const error = new Error("Password phải có ít nhất 6 ký tự");
        error.statusCode = 400;
        throw error;
      }

      user.password = await bcrypt.hash(password, 10);
    }
  }

  await user.save();
  return sanitizeUser(user);
};

export const updateCurrentUserService = async (currentUser, payload) => {
  const parsedId = parseId(currentUser?.id);
  const user = await User.findByPk(parsedId);

  if (!user) {
    const error = new Error("Không tìm thấy người dùng");
    error.statusCode = 404;
    throw error;
  }

  const fullname = normalizeRequiredString(payload?.fullname, "Họ tên");
  const email = normalizeOptionalString(payload?.email);
  const phone = normalizeOptionalPhone(payload?.phone);
  const date_of_birth = normalizeOptionalDateOnly(payload?.date_of_birth, "Ngày sinh");
  const gender = normalizeOptionalGender(payload?.gender);
  const address = normalizeOptionalString(payload?.address);

  await ensureUniqueUserContacts({
    userId: user.id,
    email,
    phone,
  });

  user.fullname = fullname;
  user.email = email;
  user.phone = phone;
  user.date_of_birth = date_of_birth;
  user.gender = gender;
  user.address = address;

  await user.save();
  return sanitizeUser(user);
};

export const deleteUserService = async (id, currentUser) => {
  const parsedId = parseId(id);

  if (currentUser?.id === parsedId) {
    const error = new Error("Không thể tự xóa tài khoản đang đăng nhập");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findByPk(parsedId);
  if (!user) {
    const error = new Error("Không tìm thấy người dùng");
    error.statusCode = 404;
    throw error;
  }

  await user.destroy();
};
