import nodemailer from "nodemailer";

const buildTrackingId = (purpose, email) =>
  `otp_${String(purpose || "general").toLowerCase()}_${email.replace(/[^a-z0-9]/gi, "").slice(-8)}_${Date.now()}`;

const EMAIL_OTP_PROVIDER = String(process.env.EMAIL_OTP_PROVIDER || "resend").toLowerCase();
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_OTP_FROM = process.env.EMAIL_OTP_FROM || "";
const EMAIL_OTP_APP_NAME = process.env.EMAIL_OTP_APP_NAME || "Luong's Hospital";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getOtpEmailContent = (purpose) => {
  const normalizedPurpose = String(purpose || "REGISTER").toUpperCase();

  if (normalizedPurpose === "RESET_PASSWORD") {
    return {
      subject: `Mã OTP đặt lại mật khẩu ${EMAIL_OTP_APP_NAME}`,
      title: "Xác thực đặt lại mật khẩu",
      description:
        "Vui lòng dùng mã OTP dưới đây để xác thực yêu cầu đặt lại mật khẩu tài khoản bệnh nhân trên hệ thống.",
      codeLabel: "Mã OTP đặt lại mật khẩu",
      warning:
        "Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này và không chia sẻ mã OTP cho bất kỳ ai.",
      text: (otpCode) => `Mã OTP đặt lại mật khẩu của bạn là ${otpCode}. Mã có hiệu lực trong 5 phút.`,
    };
  }

  return {
    subject: `Mã OTP đăng ký tài khoản ${EMAIL_OTP_APP_NAME}`,
    title: "Xác thực đăng ký tài khoản",
    description:
      "Vui lòng dùng mã OTP dưới đây để xác thực email và hoàn tất tạo tài khoản bệnh nhân trên hệ thống.",
    codeLabel: "Mã OTP đăng ký",
    warning:
      "Nếu bạn không thực hiện đăng ký tài khoản, vui lòng bỏ qua email này. Không chia sẻ mã OTP cho bất kỳ ai.",
    text: (otpCode) => `Mã OTP đăng ký tài khoản của bạn là ${otpCode}. Mã có hiệu lực trong 5 phút.`,
  };
};

const buildOtpEmailHtml = ({ otpCode, purpose }) => {
  const content = getOtpEmailContent(purpose);
  const safeOtpCode = escapeHtml(otpCode);

  return `
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${content.subject}</title>
  </head>
  <body style="margin:0; padding:0; background:#eef5fb; font-family:Arial, Helvetica, sans-serif; color:#16324f;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef5fb; padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px; background:#ffffff; border:1px solid #d7e5ef; border-radius:18px; overflow:hidden;">
            <tr>
              <td style="padding:24px 28px; background:#0f5f8f;">
                <div style="font-size:13px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#d8eef8;">
                  Digital Clinic Platform
                </div>
                <div style="margin-top:8px; font-size:24px; line-height:1.25; font-weight:800; color:#ffffff;">
                  ${EMAIL_OTP_APP_NAME}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0; font-size:22px; line-height:1.35; color:#12395a;">
                  ${content.title}
                </h1>
                <p style="margin:12px 0 0; font-size:15px; line-height:1.7; color:#5f7690;">
                  ${content.description}
                </p>

                <div style="margin:24px 0; padding:22px; border-radius:16px; background:#f1f8fc; border:1px solid #cfe4f1; text-align:center;">
                  <div style="font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#52708a;">
                    ${content.codeLabel}
                  </div>
                  <div style="margin-top:10px; font-size:34px; line-height:1; letter-spacing:8px; font-weight:800; color:#0f5f8f;">
                    ${safeOtpCode}
                  </div>
                  <div style="margin-top:14px; font-size:14px; color:#5f7690;">
                    Mã có hiệu lực trong <strong style="color:#16324f;">5 phút</strong>.
                  </div>
                </div>

                <div style="padding:14px 16px; border-radius:14px; background:#fff8ed; border:1px solid #f4d3a4; color:#8a540f; font-size:14px; line-height:1.6;">
                  ${content.warning}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px; background:#f7fbfe; border-top:1px solid #e2edf5; color:#6f8295; font-size:12px; line-height:1.6;">
                Email được gửi tự động từ ${EMAIL_OTP_APP_NAME}. Vui lòng không trả lời email này.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
};

const buildTemporaryPasswordEmailHtml = ({ fullname, username, temporaryPassword }) => {
  const safeFullname = escapeHtml(fullname || "Anh/Chị");
  const safeUsername = escapeHtml(username);
  const safeTemporaryPassword = escapeHtml(temporaryPassword);

  return `
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mật khẩu tạm thời ${EMAIL_OTP_APP_NAME}</title>
  </head>
  <body style="margin:0; padding:0; background:#eef5fb; font-family:Arial, Helvetica, sans-serif; color:#16324f;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef5fb; padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px; background:#ffffff; border:1px solid #d7e5ef; border-radius:18px; overflow:hidden;">
            <tr>
              <td style="padding:24px 28px; background:#0f5f8f;">
                <div style="font-size:13px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#d8eef8;">
                  Digital Clinic Platform
                </div>
                <div style="margin-top:8px; font-size:24px; line-height:1.25; font-weight:800; color:#ffffff;">
                  ${EMAIL_OTP_APP_NAME}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0; font-size:22px; line-height:1.35; color:#12395a;">
                  Mật khẩu tạm thời truy cập hệ thống nội bộ
                </h1>
                <p style="margin:12px 0 0; font-size:15px; line-height:1.7; color:#5f7690;">
                  Xin chào <strong style="color:#16324f;">${safeFullname}</strong>, quản trị viên đã cấp lại mật khẩu tạm thời cho tài khoản bác sĩ/lễ tân của bạn.
                </p>

                <div style="margin:24px 0; padding:22px; border-radius:16px; background:#f1f8fc; border:1px solid #cfe4f1;">
                  <p style="margin:0 0 10px; font-size:13px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#52708a;">
                    Thông tin đăng nhập
                  </p>
                  <p style="margin:0 0 8px; font-size:15px; color:#16324f;">
                    Tên đăng nhập: <strong>${safeUsername}</strong>
                  </p>
                  <p style="margin:0; font-size:15px; color:#16324f;">
                    Mật khẩu tạm thời:
                  </p>
                  <div style="margin-top:10px; padding:14px 16px; border-radius:12px; background:#ffffff; border:1px dashed #9fc7e1; font-size:22px; letter-spacing:2px; font-weight:800; color:#0f5f8f;">
                    ${safeTemporaryPassword}
                  </div>
                </div>

                <div style="padding:14px 16px; border-radius:14px; background:#fff8ed; border:1px solid #f4d3a4; color:#8a540f; font-size:14px; line-height:1.6;">
                  Mật khẩu này chỉ dùng để đăng nhập tạm thời. Sau khi đăng nhập, hệ thống sẽ yêu cầu bạn đổi mật khẩu mới trước khi vào trang chủ.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px; background:#f7fbfe; border-top:1px solid #e2edf5; color:#6f8295; font-size:12px; line-height:1.6;">
                Email được gửi tự động từ ${EMAIL_OTP_APP_NAME}. Vui lòng không trả lời email này.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
};

const sendResendEmailOtp = async ({ email, otpCode, purpose }) => {
  if (!RESEND_API_KEY) {
    const error = new Error("Thiếu cấu hình RESEND_API_KEY");
    error.statusCode = 500;
    throw error;
  }

  if (!EMAIL_OTP_FROM) {
    const error = new Error("Thiếu cấu hình EMAIL_OTP_FROM");
    error.statusCode = 500;
    throw error;
  }

  const content = getOtpEmailContent(purpose);
  const trackingId = buildTrackingId(purpose, email);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_OTP_FROM,
      to: [email],
      subject: content.subject,
      text: content.text(otpCode),
      html: buildOtpEmailHtml({ otpCode, purpose }),
      headers: {
        "X-Tracking-Id": trackingId,
      },
    }),
  });

  const rawResponse = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(rawResponse?.message || `Gửi OTP email thất bại (${response.status})`);
    error.statusCode = 502;
    throw error;
  }

  return {
    provider: "resend",
    tracking_id: trackingId,
    provider_message_id: rawResponse?.id || null,
    raw_response: rawResponse,
  };
};

const assertSmtpConfig = () => {
  const missingFields = [];

  if (!SMTP_HOST) {
    missingFields.push("SMTP_HOST");
  }

  if (!SMTP_PORT || Number.isNaN(SMTP_PORT)) {
    missingFields.push("SMTP_PORT");
  }

  if (!SMTP_USER || SMTP_USER === "your_email@gmail.com") {
    missingFields.push("SMTP_USER");
  }

  if (!SMTP_PASS) {
    missingFields.push("SMTP_PASS");
  }

  if (!EMAIL_OTP_FROM || EMAIL_OTP_FROM.includes("your_email@gmail.com")) {
    missingFields.push("EMAIL_OTP_FROM");
  }

  if (!missingFields.length) {
    return;
  }

  const error = new Error(`Thiếu hoặc sai cấu hình SMTP: ${missingFields.join(", ")}`);
  error.statusCode = 500;
  throw error;
};

const sendSmtpEmailOtp = async ({ email, otpCode, purpose }) => {
  assertSmtpConfig();

  const content = getOtpEmailContent(purpose);
  const trackingId = buildTrackingId(purpose, email);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  try {
    const response = await transporter.sendMail({
      from: EMAIL_OTP_FROM,
      to: email,
      subject: content.subject,
      text: content.text(otpCode),
      html: buildOtpEmailHtml({ otpCode, purpose }),
      headers: {
        "X-Tracking-Id": trackingId,
      },
    });

    return {
      provider: "smtp",
      tracking_id: trackingId,
      provider_message_id: response.messageId || null,
      raw_response: response,
    };
  } catch (smtpError) {
    const error = new Error(smtpError?.message || "Gửi OTP qua SMTP thất bại");
    error.statusCode = 502;
    throw error;
  }
};

export const sendEmailOtpMessage = async ({ email, otpCode, purpose }) => {
  if (EMAIL_OTP_PROVIDER === "resend") {
    return sendResendEmailOtp({ email, otpCode, purpose });
  }

  if (EMAIL_OTP_PROVIDER === "smtp") {
    return sendSmtpEmailOtp({ email, otpCode, purpose });
  }

  const error = new Error("EMAIL_OTP_PROVIDER không được hỗ trợ. Chỉ hỗ trợ resend hoặc smtp");
  error.statusCode = 500;
  throw error;
};

const buildTemporaryPasswordText = ({ fullname, username, temporaryPassword }) =>
  [
    `Xin chào ${fullname || "Anh/Chị"},`,
    `Quản trị viên đã cấp lại mật khẩu tạm thời cho tài khoản bác sĩ/lễ tân trên ${EMAIL_OTP_APP_NAME}.`,
    `Tên đăng nhập: ${username}`,
    `Mật khẩu tạm thời: ${temporaryPassword}`,
    "Mật khẩu này chỉ dùng để đăng nhập tạm thời. Sau khi đăng nhập, hệ thống sẽ yêu cầu đổi mật khẩu mới trước khi vào trang chủ.",
  ].join("\n");

const sendResendStaffTemporaryPassword = async ({ email, fullname, username, temporaryPassword }) => {
  if (!RESEND_API_KEY) {
    const error = new Error("Thiếu cấu hình RESEND_API_KEY");
    error.statusCode = 500;
    throw error;
  }

  if (!EMAIL_OTP_FROM) {
    const error = new Error("Thiếu cấu hình EMAIL_OTP_FROM");
    error.statusCode = 500;
    throw error;
  }

  const trackingId = buildTrackingId("TEMP_PASSWORD", email);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_OTP_FROM,
      to: [email],
      subject: `Mật khẩu tạm thời truy cập nội bộ ${EMAIL_OTP_APP_NAME}`,
      text: buildTemporaryPasswordText({ fullname, username, temporaryPassword }),
      html: buildTemporaryPasswordEmailHtml({ fullname, username, temporaryPassword }),
      headers: {
        "X-Tracking-Id": trackingId,
      },
    }),
  });

  const rawResponse = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(rawResponse?.message || `Gửi mật khẩu tạm thời thất bại (${response.status})`);
    error.statusCode = 502;
    throw error;
  }

  return {
    provider: "resend",
    tracking_id: trackingId,
    provider_message_id: rawResponse?.id || null,
    raw_response: rawResponse,
  };
};

const sendSmtpStaffTemporaryPassword = async ({ email, fullname, username, temporaryPassword }) => {
  assertSmtpConfig();

  const trackingId = buildTrackingId("TEMP_PASSWORD", email);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  try {
    const response = await transporter.sendMail({
      from: EMAIL_OTP_FROM,
      to: email,
      subject: `Mật khẩu tạm thời truy cập nội bộ ${EMAIL_OTP_APP_NAME}`,
      text: buildTemporaryPasswordText({ fullname, username, temporaryPassword }),
      html: buildTemporaryPasswordEmailHtml({ fullname, username, temporaryPassword }),
      headers: {
        "X-Tracking-Id": trackingId,
      },
    });

    return {
      provider: "smtp",
      tracking_id: trackingId,
      provider_message_id: response.messageId || null,
      raw_response: response,
    };
  } catch (smtpError) {
    const error = new Error(smtpError?.message || "Gửi mật khẩu tạm thời qua SMTP thất bại");
    error.statusCode = 502;
    throw error;
  }
};

export const sendStaffTemporaryPasswordEmailMessage = async ({ email, fullname, username, temporaryPassword }) => {
  if (EMAIL_OTP_PROVIDER === "resend") {
    return sendResendStaffTemporaryPassword({ email, fullname, username, temporaryPassword });
  }

  if (EMAIL_OTP_PROVIDER === "smtp") {
    return sendSmtpStaffTemporaryPassword({ email, fullname, username, temporaryPassword });
  }

  const error = new Error("EMAIL_OTP_PROVIDER không được hỗ trợ. Chỉ hỗ trợ resend hoặc smtp");
  error.statusCode = 500;
  throw error;
};
