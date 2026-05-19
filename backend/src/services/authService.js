import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { Op } from "sequelize";
import db from "../models/index.js";
import {
  assertEmailOtpVerifiedService,
  assertPhoneOtpVerifiedService,
  consumeVerifiedEmailOtpService,
  consumeVerifiedPhoneOtpService,
  sendPhoneOtpCodeService,
  verifyPhoneOtpCodeService,
} from "./otpService.js";

const { User, RefreshToken, sequelize } = db;
const INVALID_CREDENTIALS_MESSAGE = "Thông tin đăng nhập không hợp lệ";
const ALLOWED_ROLES = ["ADMIN", "DOCTOR", "PATIENT", "RECEPTIONIST"];
const DEFAULT_JWT_EXPIRES_IN = "15m";
const DEFAULT_REFRESH_TOKEN_EXPIRES_IN_DAYS = 14;
const DEFAULT_JWT_ISSUER = "luong-hospital-api";
const DEFAULT_JWT_AUDIENCE = "luong-clinic-platform";
const AUTH_REQUIRE_OTP_ON_REGISTER =
  process.env.AUTH_REQUIRE_OTP_ON_REGISTER !== "false";
const AUTH_REQUIRE_OTP_ON_CHANGE_PASSWORD =
  process.env.AUTH_REQUIRE_OTP_ON_CHANGE_PASSWORD !== "false";

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

const normalizeOptionalOtpCode = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    const error = new Error("OTP không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    const error = new Error("OTP phải gồm 6 chữ số");
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

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

const normalizeRefreshToken = (value) => {
  if (typeof value !== "string") {
    const error = new Error("Refresh token không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    const error = new Error("Refresh token không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

const getRefreshTokenLifetimeDays = () => {
  const rawValue = Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_REFRESH_TOKEN_EXPIRES_IN_DAYS;
  }

  return Math.floor(rawValue);
};

const buildRefreshExpiryDate = () => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + getRefreshTokenLifetimeDays());
  return expiresAt;
};

const hashRefreshToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const buildAuthUser = (user) => ({
  id: user.id,
  username: user.username,
  fullname: user.fullname,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
});

const buildAuthTokenPayload = (user) => ({
  sub: String(user.id),
  id: user.id,
  username: user.username,
  role: user.role,
  status: user.status,
});

const buildAuthTokenMetadata = (token) => {
  const decodedToken = jwt.decode(token);
  const issuedAt =
    decodedToken && typeof decodedToken === "object" && typeof decodedToken.iat === "number"
      ? new Date(decodedToken.iat * 1000).toISOString()
      : new Date().toISOString();
  const expiresAt =
    decodedToken && typeof decodedToken === "object" && typeof decodedToken.exp === "number"
      ? new Date(decodedToken.exp * 1000).toISOString()
      : null;
  const expiresInSeconds =
    decodedToken &&
    typeof decodedToken === "object" &&
    typeof decodedToken.exp === "number" &&
    typeof decodedToken.iat === "number"
      ? Math.max(decodedToken.exp - decodedToken.iat, 0)
      : null;

  return {
    issuedAt,
    expiresAt,
    expiresInSeconds,
  };
};

const issueAccessToken = (user) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    const error = new Error("Server chưa cấu hình JWT_SECRET");
    error.statusCode = 500;
    throw error;
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN;
  const issuer = process.env.JWT_ISSUER || DEFAULT_JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE || DEFAULT_JWT_AUDIENCE;

  const accessToken = jwt.sign(buildAuthTokenPayload(user), jwtSecret, {
    expiresIn,
    issuer,
    audience,
  });

  return accessToken;
};

const issueRefreshToken = async (user, context = {}, transaction) => {
  if (!RefreshToken) {
    const error = new Error("Server chưa cấu hình RefreshToken model");
    error.statusCode = 500;
    throw error;
  }

  const rawRefreshToken = crypto.randomBytes(48).toString("hex");
  const refreshTokenHash = hashRefreshToken(rawRefreshToken);
  const expiresAt = buildRefreshExpiryDate();

  await RefreshToken.create(
    {
      user_id: user.id,
      token_hash: refreshTokenHash,
      expires_at: expiresAt,
      revoked_at: null,
      user_agent: context.userAgent ?? null,
      ip_address: context.ipAddress ?? null,
    },
    { transaction }
  );

  return {
    refreshToken: rawRefreshToken,
    refreshTokenExpiresAt: expiresAt.toISOString(),
  };
};

const revokeStoredRefreshToken = async (refreshTokenValue, transaction) => {
  if (!RefreshToken) {
    return false;
  }

  const tokenHash = hashRefreshToken(normalizeRefreshToken(refreshTokenValue));
  const refreshToken = await RefreshToken.findOne({
    where: { token_hash: tokenHash },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (!refreshToken || refreshToken.revoked_at) {
    return false;
  }

  refreshToken.revoked_at = new Date();
  await refreshToken.save({ transaction });
  return true;
};

const revokeAllUserRefreshTokens = async (userId, transaction) => {
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
    }
  );
};

const buildLoginResponse = async (user, context = {}, transaction) => {
  const accessToken = issueAccessToken(user);
  const tokenMeta = buildAuthTokenMetadata(accessToken);
  const refreshTokenMeta = await issueRefreshToken(user, context, transaction);

  return {
    token: accessToken,
    accessToken,
    tokenType: "Bearer",
    issuedAt: tokenMeta.issuedAt,
    expiresAt: tokenMeta.expiresAt,
    expiresInSeconds: tokenMeta.expiresInSeconds,
    refreshToken: refreshTokenMeta.refreshToken,
    refreshTokenExpiresAt: refreshTokenMeta.refreshTokenExpiresAt,
    user: buildAuthUser(user),
  };
};

export const loginService = async (username, password, context = {}) => {
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

  if (user.status === "Inactive") {
    const error = new Error("Tài khoản đã bị khóa");
    error.statusCode = 403;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    const error = new Error(INVALID_CREDENTIALS_MESSAGE);
    error.statusCode = 401;
    throw error;
  }

  return buildLoginResponse(user, context);
};

export const registerUserService = async (payload) => {
  const username = normalizeRequiredString(payload?.username, "Username");
  const password = normalizeRequiredString(payload?.password, "Password");
  const confirmPassword = normalizeRequiredString(payload?.confirm_password, "Xác nhận mật khẩu");
  const fullname = normalizeRequiredString(payload?.fullname, "Fullname");

  if (password !== confirmPassword) {
    const error = new Error("Xác nhận mật khẩu không khớp");
    error.statusCode = 400;
    throw error;
  }

  ensureStrongPassword(password);

  const email = normalizeOptionalString(payload?.email);
  const phone = normalizeOptionalPhone(payload?.phone);
  const otpCode = normalizeOptionalOtpCode(payload?.otp_code);
  if (payload?.role !== undefined && payload?.role !== null && payload?.role !== "" && payload.role !== "PATIENT") {
    const error = new Error("Chỉ được đăng ký tài khoản bệnh nhân");
    error.statusCode = 403;
    throw error;
  }

  const role = "PATIENT";

  if (AUTH_REQUIRE_OTP_ON_REGISTER && !email) {
    const error = new Error("Cần email để đăng ký tài khoản");
    error.statusCode = 400;
    throw error;
  }

  if (AUTH_REQUIRE_OTP_ON_REGISTER && !otpCode) {
    const error = new Error("Vui lòng xác thực OTP trước khi đăng ký");
    error.statusCode = 400;
    throw error;
  }

  const existed = await User.findOne({
    where: {
      [Op.or]: [
        { username },
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
      ],
    },
  });
  if (existed) {
    let message = "Username đã tồn tại";
    if (existed.username === username) {
      message = "Username đã tồn tại";
    } else if (email && existed.email === email) {
      message = "Email đã tồn tại";
    } else if (phone && existed.phone === phone) {
      message = "Số điện thoại đã tồn tại";
    }

    const error = new Error(message);
    error.statusCode = 409;
    throw error;
  }

  const created = await sequelize.transaction(async (transaction) => {
    if (email && otpCode) {
      await assertEmailOtpVerifiedService(
        {
          email,
          code: otpCode,
          purpose: "REGISTER",
        },
        { transaction },
      );
    }

    const user = await User.create(
      {
        username,
        password,
        fullname,
        email,
        phone,
        role,
        status: "Active",
      },
      { transaction },
    );

    if (email && otpCode) {
      await consumeVerifiedEmailOtpService(
        {
          email,
          code: otpCode,
          purpose: "REGISTER",
        },
        { transaction },
      );
    }

    return user;
  });

  return {
    id: created.id,
    username: created.username,
    fullname: created.fullname,
    email: created.email,
    phone: created.phone,
    role: created.role,
    status: created.status,
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
  const otpCode = normalizeOptionalOtpCode(payload?.otpCode ?? payload?.otp_code);

  ensureStrongPassword(newPassword);

  if (newPassword !== confirmPassword) {
    const error = new Error("Xác nhận mật khẩu không khớp");
    error.statusCode = 400;
    throw error;
  }

  return sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(parsedUserId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) {
      const error = new Error("Không tìm thấy người dùng");
      error.statusCode = 404;
      throw error;
    }

    if (AUTH_REQUIRE_OTP_ON_CHANGE_PASSWORD) {
      if (!user.phone) {
        const error = new Error("Tài khoản chưa có số điện thoại để xác thực OTP");
        error.statusCode = 400;
        throw error;
      }

      if (!otpCode) {
        const error = new Error("Vui lòng xác thực OTP trước khi đổi mật khẩu");
        error.statusCode = 400;
        throw error;
      }
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

    if (user.phone && otpCode) {
      await assertPhoneOtpVerifiedService(
        {
          phone: user.phone,
          code: otpCode,
          purpose: "CHANGE_PASSWORD",
        },
        { transaction },
      );
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save({ transaction });

    await revokeAllUserRefreshTokens(user.id, transaction);

    if (user.phone && otpCode) {
      await consumeVerifiedPhoneOtpService(
        {
          phone: user.phone,
          code: otpCode,
          purpose: "CHANGE_PASSWORD",
        },
        { transaction },
      );
    }

    return {
      id: user.id,
      username: user.username,
    };
  });
};

export const refreshSessionService = async (payload, context = {}) => {
  const refreshTokenValue = normalizeRefreshToken(payload?.refreshToken ?? payload?.refresh_token);

  if (!RefreshToken) {
    const error = new Error("Server chưa hỗ trợ refresh token");
    error.statusCode = 500;
    throw error;
  }

  return sequelize.transaction(async (transaction) => {
    const tokenHash = hashRefreshToken(refreshTokenValue);
    const refreshToken = await RefreshToken.findOne({
      where: { token_hash: tokenHash },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!refreshToken || refreshToken.revoked_at || refreshToken.expires_at < new Date()) {
      const error = new Error("Refresh token không hợp lệ hoặc đã hết hạn");
      error.statusCode = 401;
      throw error;
    }

    const user = await User.findByPk(refreshToken.user_id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!user) {
      const error = new Error("Người dùng không tồn tại");
      error.statusCode = 401;
      throw error;
    }

    if (user.status === "Inactive") {
      const error = new Error("Tài khoản đã bị khóa");
      error.statusCode = 403;
      throw error;
    }

    refreshToken.revoked_at = new Date();
    await refreshToken.save({ transaction });

    return buildLoginResponse(user, context, transaction);
  });
};

export const logoutService = async (payload) => {
  const refreshTokenValue = normalizeRefreshToken(payload?.refreshToken ?? payload?.refresh_token);
  await revokeStoredRefreshToken(refreshTokenValue);
  return { revoked: true };
};

const getCurrentUserPhoneOrThrow = async (userId) => {
  const parsedUserId = Number(userId);
  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
    const error = new Error("Người dùng không hợp lệ");
    error.statusCode = 401;
    throw error;
  }

  const user = await User.findByPk(parsedUserId, {
    attributes: ["id", "username", "phone"],
  });

  if (!user) {
    const error = new Error("Không tìm thấy người dùng");
    error.statusCode = 404;
    throw error;
  }

  if (!user.phone) {
    const error = new Error("Tài khoản chưa có số điện thoại để xác thực OTP");
    error.statusCode = 400;
    throw error;
  }

  return user;
};

export const sendChangePasswordOtpService = async (userId) => {
  const user = await getCurrentUserPhoneOrThrow(userId);

  const otpDelivery = await sendPhoneOtpCodeService({
    phone: user.phone,
    purpose: "CHANGE_PASSWORD",
  });

  return {
    ...otpDelivery,
    username: user.username,
  };
};

export const verifyChangePasswordOtpService = async (userId, payload) => {
  const user = await getCurrentUserPhoneOrThrow(userId);
  const code = normalizeRequiredString(payload?.code ?? payload?.otpCode, "OTP");

  return verifyPhoneOtpCodeService({
    phone: user.phone,
    code,
    purpose: "CHANGE_PASSWORD",
  });
};
