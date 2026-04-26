import bcrypt from "bcrypt";
import db from "../models/index.js";

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

export const getAllUsersService = async () => {
  const users = await User.findAll({
    order: [["id", "ASC"]],
  });

  return users.map(sanitizeUser);
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
  const phone = normalizeOptionalString(payload?.phone);
  const date_of_birth = normalizeOptionalDateOnly(payload?.date_of_birth, "Ngày sinh");
  const gender = normalizeOptionalGender(payload?.gender);
  const address = normalizeOptionalString(payload?.address);
  const role = normalizeRole(payload?.role);

  if (password.length < 6) {
    const error = new Error("Password phải có ít nhất 6 ký tự");
    error.statusCode = 400;
    throw error;
  }

  const existed = await User.findOne({ where: { username } });
  if (existed) {
    const error = new Error("Username đã tồn tại");
    error.statusCode = 409;
    throw error;
  }

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
  const phone = normalizeOptionalString(payload?.phone);
  const date_of_birth = normalizeOptionalDateOnly(payload?.date_of_birth, "Ngày sinh");
  const gender = normalizeOptionalGender(payload?.gender);
  const address = normalizeOptionalString(payload?.address);
  const role = normalizeRole(payload?.role);
  const rawPassword = payload?.password;

  if (user.username !== username) {
    const existed = await User.findOne({ where: { username } });
    if (existed) {
      const error = new Error("Username đã tồn tại");
      error.statusCode = 409;
      throw error;
    }
  }

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
  const phone = normalizeOptionalString(payload?.phone);
  const date_of_birth = normalizeOptionalDateOnly(payload?.date_of_birth, "Ngày sinh");
  const gender = normalizeOptionalGender(payload?.gender);
  const address = normalizeOptionalString(payload?.address);

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
