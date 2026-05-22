import bcrypt from "bcrypt";
import crypto from "crypto";
import { Op } from "sequelize";
import db from "../models/index.js";
import { sendStaffTemporaryPasswordEmailMessage } from "./emailOtpDeliveryService.js";
import {
  buildPaginationMeta,
  createPaginatedListResult,
  createListResult,
  filterItemsByLooseSearch,
  normalizeOptionalQueryString,
  parsePaginationQuery,
} from "../utils/queryUtils.js";

const { User, RefreshToken, sequelize } = db;

const ALLOWED_ROLES = ["ADMIN", "DOCTOR", "PATIENT", "RECEPTIONIST"];
const STAFF_ACCOUNT_ROLES = ["DOCTOR", "RECEPTIONIST"];
const ALLOWED_GENDERS = ["MALE", "FEMALE", "OTHER"];
const ALLOWED_USER_STATUSES = ["Active", "Inactive"];

const ensureStrongPassword = (password) => {
  if (
    password.length < 8 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    const error = new Error(
      "Password phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt"
    );
    error.statusCode = 400;
    throw error;
  }
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

const normalizeUserScope = (scope) => {
  const normalized = normalizeOptionalQueryString(scope, 20);
  if (!normalized) {
    return null;
  }

  if (!["staff", "patients"].includes(normalized)) {
    const error = new Error("Phạm vi người dùng không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return normalized;
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

const normalizeUserStatus = (value, { fallback = "Active", required = false } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (required) {
      const error = new Error("Trạng thái không hợp lệ");
      error.statusCode = 400;
      throw error;
    }

    return fallback;
  }

  if (typeof value !== "string" || !ALLOWED_USER_STATUSES.includes(value)) {
    const error = new Error("Trạng thái không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return value;
};

const ensureStaffAccountRole = (role, message = "Chỉ hỗ trợ tài khoản bác sĩ hoặc lễ tân") => {
  if (!STAFF_ACCOUNT_ROLES.includes(role)) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
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
  status: user.status,
  must_change_password: Boolean(user.must_change_password),
});

const generateTemporaryPassword = () => {
  const numberPart = crypto.randomInt(1000, 10000);
  const upperLetters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowerLetters = "abcdefghijkmnopqrstuvwxyz";
  const firstUpper = upperLetters[crypto.randomInt(0, upperLetters.length)];
  const secondUpper = upperLetters[crypto.randomInt(0, upperLetters.length)];
  const randomLower = lowerLetters[crypto.randomInt(0, lowerLetters.length)];

  return `Temp-${numberPart}-${firstUpper}${secondUpper}${randomLower}`;
};

const revokeUserRefreshTokens = async (userId, transaction) => {
  if (!RefreshToken) {
    return;
  }

  await RefreshToken.update(
    { revoked_at: new Date() },
    {
      where: {
        user_id: userId,
        revoked_at: null,
      },
      transaction,
    },
  );
};

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
  const status = normalizeOptionalQueryString(filters?.status, 30);
  const scope = normalizeUserScope(filters?.scope);
  const where = {};

  if (scope === "staff") {
    where.role = { [Op.in]: STAFF_ACCOUNT_ROLES };
  }

  if (scope === "patients") {
    where.role = "PATIENT";
  }

  if (role) {
    const normalizedRole = normalizeRole(role);
    if (scope === "staff") {
      ensureStaffAccountRole(normalizedRole, "Vai trò không thuộc phạm vi nhân sự");
    }

    if (scope === "patients" && normalizedRole !== "PATIENT") {
      const error = new Error("Vai trò không thuộc phạm vi bệnh nhân");
      error.statusCode = 400;
      throw error;
    }

    where.role = normalizedRole;
  }

  if (gender) {
    where.gender = normalizeOptionalGender(gender);
  }

  if (status) {
    where.status = normalizeUserStatus(status, { required: true });
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
  const status = normalizeUserStatus(payload?.status);

  ensureStaffAccountRole(role, "Admin chỉ được tạo tài khoản cho bác sĩ hoặc lễ tân");

  ensureStrongPassword(password);

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
    status,
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

  ensureStaffAccountRole(user.role, "Chỉ được cập nhật tài khoản bác sĩ hoặc lễ tân");

  const username = normalizeRequiredString(payload?.username, "Username");
  const fullname = normalizeRequiredString(payload?.fullname, "Fullname");
  const email = normalizeOptionalString(payload?.email);
  const phone = normalizeOptionalPhone(payload?.phone);
  const date_of_birth = normalizeOptionalDateOnly(payload?.date_of_birth, "Ngày sinh");
  const gender = normalizeOptionalGender(payload?.gender);
  const address = normalizeOptionalString(payload?.address);
  const role = normalizeRole(payload?.role);
  ensureStaffAccountRole(role, "Chỉ được cập nhật tài khoản thành bác sĩ hoặc lễ tân");

  const status = payload?.status === undefined
    ? user.status
    : normalizeUserStatus(payload?.status, { required: true });
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
  user.status = status;

  if (rawPassword !== undefined && rawPassword !== null) {
    if (typeof rawPassword !== "string") {
      const error = new Error("Password không hợp lệ");
      error.statusCode = 400;
      throw error;
    }

    const password = rawPassword.trim();
    if (password) {
      ensureStrongPassword(password);

      user.password = await bcrypt.hash(password, 10);
    }
  }

  await user.save();
  return sanitizeUser(user);
};

export const resetUserPasswordService = async (id) => {
  const parsedId = parseId(id);
  const temporaryPassword = generateTemporaryPassword();

  return sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(parsedId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!user) {
      const error = new Error("Không tìm thấy người dùng");
      error.statusCode = 404;
      throw error;
    }

    ensureStaffAccountRole(user.role, "Chỉ được reset mật khẩu cho bác sĩ hoặc lễ tân");

    if (user.status === "Inactive") {
      const error = new Error("Tài khoản đang không hoạt động, không thể gửi mật khẩu tạm thời");
      error.statusCode = 400;
      throw error;
    }

    if (!user.email) {
      const error = new Error("Tài khoản chưa có email để nhận mật khẩu tạm thời");
      error.statusCode = 400;
      throw error;
    }

    user.password = await bcrypt.hash(temporaryPassword, 10);
    user.must_change_password = true;
    await user.save({ transaction });
    await revokeUserRefreshTokens(user.id, transaction);

    await sendStaffTemporaryPasswordEmailMessage({
      email: user.email,
      fullname: user.fullname,
      username: user.username,
      temporaryPassword,
    });

    return {
      ...sanitizeUser(user),
      temporary_password_sent: true,
    };
  });
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

  ensureStaffAccountRole(user.role, "Chỉ được xóa tài khoản bác sĩ hoặc lễ tân");

  await user.destroy();
};

export const updateUserStatusService = async (id, payload, currentUser) => {
  const parsedId = parseId(id);
  const status = normalizeUserStatus(payload?.status, { required: true });

  if (currentUser?.id === parsedId && status === "Inactive") {
    const error = new Error("Không thể tự khóa tài khoản đang đăng nhập");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findByPk(parsedId);
  if (!user) {
    const error = new Error("Không tìm thấy người dùng");
    error.statusCode = 404;
    throw error;
  }

  if (!STAFF_ACCOUNT_ROLES.includes(user.role) && user.role !== "PATIENT") {
    const error = new Error("Không thể cập nhật trạng thái tài khoản này");
    error.statusCode = 400;
    throw error;
  }

  if (user.status === status) {
    return sanitizeUser(user);
  }

  user.status = status;
  await user.save();

  return sanitizeUser(user);
};
