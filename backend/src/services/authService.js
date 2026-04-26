import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import db from "../models/index.js";

const { User } = db;
const INVALID_CREDENTIALS_MESSAGE = "Thông tin đăng nhập không hợp lệ";
const ALLOWED_ROLES = ["ADMIN", "DOCTOR", "PATIENT", "RECEPTIONIST"];
const DEFAULT_JWT_EXPIRES_IN = "1d";

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

export const loginService = async (username, password) => {
  if (!username || !password) {
    const error = new Error("Thiếu username hoặc password");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOne({ where: { username } });

  if (!user) {
    const error = new Error(INVALID_CREDENTIALS_MESSAGE);
    error.statusCode = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    const error = new Error(INVALID_CREDENTIALS_MESSAGE);
    error.statusCode = 401;
    throw error;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    const error = new Error("Server chưa cấu hình JWT_SECRET");
    error.statusCode = 500;
    throw error;
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN;

  const token = jwt.sign(
    {
      id: user.id,
      role: user.role,
    },
    jwtSecret,
    { expiresIn }
  );

  const decodedToken = jwt.decode(token);
  const expiresAt =
    decodedToken && typeof decodedToken === "object" && typeof decodedToken.exp === "number"
      ? new Date(decodedToken.exp * 1000).toISOString()
      : null;

  return {
    token,
    expiresAt,
    user: {
      id: user.id,
      username: user.username,
      fullname: user.fullname,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
  };
};

export const registerUserService = async (payload) => {
  const username = normalizeRequiredString(payload?.username, "Username");
  const password = normalizeRequiredString(payload?.password, "Password");
  const fullname = normalizeRequiredString(payload?.fullname, "Fullname");

  if (password.length < 6) {
    const error = new Error("Password phải có ít nhất 6 ký tự");
    error.statusCode = 400;
    throw error;
  }

  const email = normalizeOptionalString(payload?.email);
  const phone = normalizeOptionalString(payload?.phone);
  const role = normalizeRole(payload?.role);

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
    role,
  });

  return {
    id: created.id,
    username: created.username,
    fullname: created.fullname,
    email: created.email,
    phone: created.phone,
    role: created.role,
  };
};

export const changePasswordService = async (userId, payload) => {
  const parsedUserId = Number(userId);
  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
    const error = new Error("Người dùng không hợp lệ");
    error.statusCode = 401;
    throw error;
  }

  const currentPassword = normalizeRequiredString(payload?.currentPassword, "Mật khẩu hiện tại");
  const newPassword = normalizeRequiredString(payload?.newPassword, "Mật khẩu mới");
  const confirmPassword = normalizeRequiredString(payload?.confirmPassword, "Xác nhận mật khẩu mới");

  if (newPassword.length < 6) {
    const error = new Error("Password phải có ít nhất 6 ký tự");
    error.statusCode = 400;
    throw error;
  }

  if (newPassword !== confirmPassword) {
    const error = new Error("Xác nhận mật khẩu không khớp");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findByPk(parsedUserId);
  if (!user) {
    const error = new Error("Không tìm thấy người dùng");
    error.statusCode = 404;
    throw error;
  }

  const isCurrentPasswordMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentPasswordMatch) {
    const error = new Error("Mật khẩu hiện tại không đúng");
    error.statusCode = 400;
    throw error;
  }

  const isSameAsCurrentPassword = await bcrypt.compare(newPassword, user.password);
  if (isSameAsCurrentPassword) {
    const error = new Error("Mật khẩu mới phải khác mật khẩu hiện tại");
    error.statusCode = 400;
    throw error;
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  return {
    id: user.id,
    username: user.username,
  };
};