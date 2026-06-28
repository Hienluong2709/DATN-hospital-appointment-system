const DEFAULT_ZALO_ZNS_ENDPOINT =
  "https://business.openapi.zalo.me/message/template";
const DEFAULT_ZALO_ZNS_TIMEOUT_MS = 10_000;

const OTP_DELIVERY_PROVIDER = String(
  process.env.OTP_DELIVERY_PROVIDER || "mock",
).toLowerCase();
const ZALO_ZNS_ENDPOINT =
  process.env.ZALO_ZNS_ENDPOINT || DEFAULT_ZALO_ZNS_ENDPOINT;
const ZALO_ZNS_ACCESS_TOKEN = process.env.ZALO_ZNS_ACCESS_TOKEN || "";
const ZALO_ZNS_OTP_TEMPLATE_ID = process.env.ZALO_ZNS_OTP_TEMPLATE_ID || "";
const ZALO_ZNS_OTP_TEMPLATE_DATA_KEY =
  process.env.ZALO_ZNS_OTP_TEMPLATE_DATA_KEY || "otp";
const ZALO_ZNS_OTP_TEMPLATE_APP_NAME_KEY =
  process.env.ZALO_ZNS_OTP_TEMPLATE_APP_NAME_KEY || "app_name";
const ZALO_ZNS_OTP_APP_NAME =
  process.env.ZALO_ZNS_OTP_APP_NAME || "Luong's Hospital";
const ZALO_ZNS_TIMEOUT_MS =
  Number(process.env.ZALO_ZNS_TIMEOUT_MS) || DEFAULT_ZALO_ZNS_TIMEOUT_MS;

const maskPhone = (phone) => {
  if (!phone || phone.length < 4) {
    return phone;
  }

  return `${"*".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
};

const buildTrackingId = (purpose, phone) =>
  `otp_${String(purpose || "general").toLowerCase()}_${phone.slice(-6)}_${Date.now()}`;

const ensureZaloZnsConfigured = () => {
  if (!ZALO_ZNS_ACCESS_TOKEN) {
    const error = new Error("Thiếu cấu hình ZALO_ZNS_ACCESS_TOKEN");
    error.statusCode = 500;
    throw error;
  }

  if (!ZALO_ZNS_OTP_TEMPLATE_ID) {
    const error = new Error("Thiếu cấu hình ZALO_ZNS_OTP_TEMPLATE_ID");
    error.statusCode = 500;
    throw error;
  }
};

const sendMockOtp = async ({ phone, otpCode, purpose }) => {
  const trackingId = buildTrackingId(purpose, phone);
  console.info(
    `[otp mock] phone=${maskPhone(phone)} purpose=${purpose} code=${otpCode}`,
  );

  return {
    provider: "mock",
    tracking_id: trackingId,
    provider_message_id: trackingId,
    raw_response: null,
  };
};

const sendOtpViaZaloZns = async ({ phone, otpCode, purpose }) => {
  ensureZaloZnsConfigured();

  const trackingId = buildTrackingId(purpose, phone);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, ZALO_ZNS_TIMEOUT_MS);

  try {
    const response = await fetch(ZALO_ZNS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: ZALO_ZNS_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        phone,
        template_id: Number(ZALO_ZNS_OTP_TEMPLATE_ID),
        template_data: {
          [ZALO_ZNS_OTP_TEMPLATE_DATA_KEY]: otpCode,
          [ZALO_ZNS_OTP_TEMPLATE_APP_NAME_KEY]: ZALO_ZNS_OTP_APP_NAME,
        },
        tracking_id: trackingId,
      }),
      signal: controller.signal,
    });

    const rawResponse = await response.json().catch(() => null);

    if (!response.ok || rawResponse?.error !== 0) {
      const error = new Error(
        rawResponse?.message ||
          `Gửi OTP qua Zalo ZNS thất bại (${response.status})`,
      );
      error.statusCode = 502;
      throw error;
    }

    return {
      provider: "zalo_zns",
      tracking_id: trackingId,
      provider_message_id: rawResponse?.data?.msg_id || null,
      raw_response: rawResponse,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Gửi OTP qua Zalo ZNS bị timeout");
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

export const sendOtpMessage = async ({ phone, otpCode, purpose }) => {
  if (OTP_DELIVERY_PROVIDER === "mock") {
    return sendMockOtp({ phone, otpCode, purpose });
  }

  if (OTP_DELIVERY_PROVIDER === "zalo_zns") {
    return sendOtpViaZaloZns({ phone, otpCode, purpose });
  }

  const error = new Error("OTP_DELIVERY_PROVIDER không được hỗ trợ");
  error.statusCode = 500;
  throw error;
};
