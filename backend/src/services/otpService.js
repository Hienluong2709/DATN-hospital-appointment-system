import crypto from "crypto";
import { Op } from "sequelize";

import db from "../models/index.js";
import { sendEmailOtpMessage } from "./emailOtpDeliveryService.js";
import { sendOtpMessage } from "./zaloZnsService.js";

const { OtpCode } = db;

const OTP_EXPIRES_MINUTES = Number(process.env.OTP_EXPIRES_MINUTES) || 5;
const ALLOWED_OTP_PURPOSES = ["REGISTER", "LOGIN", "CHANGE_PHONE", "RESET_PASSWORD", "CHANGE_PASSWORD"];
const ACTIVE_OTP_STATUSES = ["Pending", "Verified"];

const normalizePhoneForOtp = (value) => {
  if (typeof value !== "string") {
    const error = new Error("Số điện thoại là bắt buộc");
    error.statusCode = 400;
    throw error;
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) {
    const error = new Error("Số điện thoại là bắt buộc");
    error.statusCode = 400;
    throw error;
  }

  if (digits.startsWith("84") && digits.length === 11) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `84${digits.slice(1)}`;
  }

  const error = new Error("Số điện thoại không hợp lệ");
  error.statusCode = 400;
  throw error;
};

const normalizeEmailForOtp = (value) => {
  if (typeof value !== "string") {
    const error = new Error("Email là bắt buộc");
    error.statusCode = 400;
    throw error;
  }

  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Email không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return email;
};

const normalizeOtpPurpose = (value) => {
  if (value === undefined || value === null || value === "") {
    return "REGISTER";
  }

  if (typeof value !== "string") {
    const error = new Error("Mục đích OTP không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  const purpose = value.trim().toUpperCase();
  if (!ALLOWED_OTP_PURPOSES.includes(purpose)) {
    const error = new Error("Mục đích OTP không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return purpose;
};

const normalizeOtpCode = (value, fieldName = "OTP") => {
  if (typeof value !== "string") {
    const error = new Error(`${fieldName} là bắt buộc`);
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    const error = new Error(`${fieldName} phải gồm 6 chữ số`);
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

const createExpiryDate = () => new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

const buildRecipientWhere = ({ phone = null, email = null }) => {
  if (email) {
    return { email };
  }

  return { phone };
};

const expireOtpCodesByScope = async ({ phone = null, email = null, purpose, statuses, excludeId, transaction }) => {
  const where = {
    ...buildRecipientWhere({ phone, email }),
    purpose,
    status: statuses.length === 1 ? statuses[0] : { [Op.in]: statuses },
  };

  if (excludeId) {
    where.id = {
      [Op.ne]: excludeId,
    };
  }

  await OtpCode.update(
    {
      status: "Expired",
    },
    {
      where,
      transaction,
    },
  );
};

const expireActiveOtpCodes = async ({ phone = null, email = null, purpose, excludeId, transaction }) => {
  await expireOtpCodesByScope({
    phone,
    email,
    purpose,
    statuses: ACTIVE_OTP_STATUSES,
    excludeId,
    transaction,
  });
};

const expireOutdatedOtpCodes = async ({ phone = null, email = null, purpose, transaction }) => {
  await OtpCode.update(
    { status: "Expired" },
    {
      where: {
        ...buildRecipientWhere({ phone, email }),
        purpose,
        status: {
          [Op.in]: ACTIVE_OTP_STATUSES,
        },
        expired_time: {
          [Op.lt]: new Date(),
        },
      },
      transaction,
    },
  );
};

const maskPhone = (phone) => {
  if (!phone || phone.length < 4) {
    return phone;
  }

  return `${"*".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
};

const maskEmail = (email) => {
  const [localPart = "", domain = ""] = String(email || "").split("@");
  if (!localPart || !domain) {
    return email;
  }

  const visiblePrefix = localPart.slice(0, 2);
  return `${visiblePrefix}${"*".repeat(Math.max(1, localPart.length - visiblePrefix.length))}@${domain}`;
};

const generateOtpCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const getVerifiedOtpRecordOrThrow = async ({ phone = null, email = null, code, purpose, transaction }) => {
  await expireOutdatedOtpCodes({ phone, email, purpose, transaction });

  const otpRecord = await OtpCode.findOne({
    where: {
      ...buildRecipientWhere({ phone, email }),
      code,
      purpose,
      status: "Verified",
    },
    order: [["id", "DESC"]],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (!otpRecord) {
    const error = new Error("Vui lòng xác thực OTP trước khi tiếp tục");
    error.statusCode = 400;
    throw error;
  }

  if (otpRecord.expired_time && new Date(otpRecord.expired_time) < new Date()) {
    otpRecord.status = "Expired";
    await otpRecord.save({ transaction });

    const error = new Error("OTP đã hết hạn");
    error.statusCode = 400;
    throw error;
  }

  return otpRecord;
};

const verifyPendingOtpCode = async ({ phone = null, email = null, code, purpose, transaction }) => {
  await expireOutdatedOtpCodes({ phone, email, purpose, transaction });

  const otpRecord = await OtpCode.findOne({
    where: {
      ...buildRecipientWhere({ phone, email }),
      code,
      purpose,
      status: "Pending",
    },
    order: [["id", "DESC"]],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (!otpRecord) {
    const error = new Error("OTP không đúng hoặc đã hết hạn");
    error.statusCode = 400;
    throw error;
  }

  if (otpRecord.expired_time && new Date(otpRecord.expired_time) < new Date()) {
    otpRecord.status = "Expired";
    await otpRecord.save({ transaction });

    const error = new Error("OTP đã hết hạn");
    error.statusCode = 400;
    throw error;
  }

  otpRecord.status = "Verified";
  otpRecord.consumed_at = null;
  await otpRecord.save({ transaction });

  await expireActiveOtpCodes({
    phone,
    email,
    purpose,
    excludeId: otpRecord.id,
    transaction,
  });

  return otpRecord;
};

export const verifyPhoneOtpCodeService = async (payload, options = {}) => {
  const phone = normalizePhoneForOtp(payload?.phone);
  const code = normalizeOtpCode(payload?.code);
  const purpose = normalizeOtpPurpose(payload?.purpose);
  const otpRecord = await verifyPendingOtpCode({
    phone,
    code,
    purpose,
    transaction: options.transaction,
  });

  return {
    phone: maskPhone(phone),
    purpose,
    verified_at: new Date().toISOString(),
    otp_id: otpRecord.id,
  };
};

export const verifyEmailOtpCodeService = async (payload, options = {}) => {
  const email = normalizeEmailForOtp(payload?.email);
  const code = normalizeOtpCode(payload?.code);
  const purpose = normalizeOtpPurpose(payload?.purpose);
  const otpRecord = await verifyPendingOtpCode({
    email,
    code,
    purpose,
    transaction: options.transaction,
  });

  return {
    email: maskEmail(email),
    purpose,
    verified_at: new Date().toISOString(),
    otp_id: otpRecord.id,
  };
};

export const assertPhoneOtpVerifiedService = async (
  { phone, code, purpose },
  options = {},
) => {
  const normalizedPhone = normalizePhoneForOtp(phone);
  const normalizedCode = normalizeOtpCode(code);
  const normalizedPurpose = normalizeOtpPurpose(purpose);
  const verifiedOtpRecord = await getVerifiedOtpRecordOrThrow({
    phone: normalizedPhone,
    code: normalizedCode,
    purpose: normalizedPurpose,
    transaction: options.transaction,
  });

  return {
    phone: maskPhone(normalizedPhone),
    purpose: normalizedPurpose,
    verified_at: new Date().toISOString(),
    otp_id: verifiedOtpRecord.id,
  };
};

export const assertEmailOtpVerifiedService = async (
  { email, code, purpose },
  options = {},
) => {
  const normalizedEmail = normalizeEmailForOtp(email);
  const normalizedCode = normalizeOtpCode(code);
  const normalizedPurpose = normalizeOtpPurpose(purpose);
  const verifiedOtpRecord = await getVerifiedOtpRecordOrThrow({
    email: normalizedEmail,
    code: normalizedCode,
    purpose: normalizedPurpose,
    transaction: options.transaction,
  });

  return {
    email: maskEmail(normalizedEmail),
    purpose: normalizedPurpose,
    verified_at: new Date().toISOString(),
    otp_id: verifiedOtpRecord.id,
  };
};

export const consumeVerifiedPhoneOtpService = async (
  { phone, code, purpose },
  options = {},
) => {
  const normalizedPhone = normalizePhoneForOtp(phone);
  const normalizedCode = normalizeOtpCode(code);
  const normalizedPurpose = normalizeOtpPurpose(purpose);
  const otpRecord = await getVerifiedOtpRecordOrThrow({
    phone: normalizedPhone,
    code: normalizedCode,
    purpose: normalizedPurpose,
    transaction: options.transaction,
  });

  otpRecord.status = "Consumed";
  otpRecord.consumed_at = new Date();
  await otpRecord.save({ transaction: options.transaction });

  return {
    phone: maskPhone(normalizedPhone),
    purpose: normalizedPurpose,
    consumed_at: otpRecord.consumed_at.toISOString(),
    otp_id: otpRecord.id,
  };
};

export const consumeVerifiedEmailOtpService = async (
  { email, code, purpose },
  options = {},
) => {
  const normalizedEmail = normalizeEmailForOtp(email);
  const normalizedCode = normalizeOtpCode(code);
  const normalizedPurpose = normalizeOtpPurpose(purpose);
  const otpRecord = await getVerifiedOtpRecordOrThrow({
    email: normalizedEmail,
    code: normalizedCode,
    purpose: normalizedPurpose,
    transaction: options.transaction,
  });

  otpRecord.status = "Consumed";
  otpRecord.consumed_at = new Date();
  await otpRecord.save({ transaction: options.transaction });

  return {
    email: maskEmail(normalizedEmail),
    purpose: normalizedPurpose,
    consumed_at: otpRecord.consumed_at.toISOString(),
    otp_id: otpRecord.id,
  };
};

export const sendPhoneOtpCodeService = async (payload) => {
  const phone = normalizePhoneForOtp(payload?.phone);
  const purpose = normalizeOtpPurpose(payload?.purpose);

  await expireOutdatedOtpCodes({ phone, purpose });
  await expireActiveOtpCodes({ phone, purpose });

  const otpCode = generateOtpCode();
  const expiresAt = createExpiryDate();

  const otpRecord = await OtpCode.create({
    phone,
    purpose,
    code: otpCode,
    expired_time: expiresAt,
    consumed_at: null,
    status: "Pending",
  });

  try {
    const delivery = await sendOtpMessage({
      phone,
      otpCode,
      purpose,
    });

    return {
      otp_id: otpRecord.id,
      phone: maskPhone(phone),
      purpose,
      expires_at: expiresAt.toISOString(),
      provider: delivery.provider,
      tracking_id: delivery.tracking_id,
      provider_message_id: delivery.provider_message_id,
    };
  } catch (error) {
    otpRecord.status = "Expired";
    await otpRecord.save();
    throw error;
  }
};

export const sendEmailOtpCodeService = async (payload) => {
  const email = normalizeEmailForOtp(payload?.email);
  const purpose = normalizeOtpPurpose(payload?.purpose);

  await expireOutdatedOtpCodes({ email, purpose });
  await expireActiveOtpCodes({ email, purpose });

  const otpCode = generateOtpCode();
  const expiresAt = createExpiryDate();

  const otpRecord = await OtpCode.create({
    email,
    phone: null,
    purpose,
    code: otpCode,
    expired_time: expiresAt,
    consumed_at: null,
    status: "Pending",
  });

  try {
    const delivery = await sendEmailOtpMessage({
      email,
      otpCode,
      purpose,
    });

    return {
      otp_id: otpRecord.id,
      email: maskEmail(email),
      purpose,
      expires_at: expiresAt.toISOString(),
      provider: delivery.provider,
      tracking_id: delivery.tracking_id,
      provider_message_id: delivery.provider_message_id,
    };
  } catch (error) {
    otpRecord.status = "Expired";
    await otpRecord.save();
    throw error;
  }
};
