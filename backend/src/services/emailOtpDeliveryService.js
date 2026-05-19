const buildTrackingId = (purpose, email) =>
  `otp_${String(purpose || "general").toLowerCase()}_${email.replace(/[^a-z0-9]/gi, "").slice(-8)}_${Date.now()}`;

const EMAIL_OTP_PROVIDER = String(process.env.EMAIL_OTP_PROVIDER || "resend").toLowerCase();
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_OTP_FROM = process.env.EMAIL_OTP_FROM || "";
const EMAIL_OTP_APP_NAME = process.env.EMAIL_OTP_APP_NAME || "Luong's Hospital";

const buildOtpEmailHtml = ({ otpCode }) => `
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mã OTP đăng ký ${EMAIL_OTP_APP_NAME}</title>
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
                  Xác thực đăng ký tài khoản
                </h1>
                <p style="margin:12px 0 0; font-size:15px; line-height:1.7; color:#5f7690;">
                  Vui lòng dùng mã OTP dưới đây để xác thực email và hoàn tất tạo tài khoản bệnh nhân trên hệ thống.
                </p>

                <div style="margin:24px 0; padding:22px; border-radius:16px; background:#f1f8fc; border:1px solid #cfe4f1; text-align:center;">
                  <div style="font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#52708a;">
                    Mã OTP của bạn
                  </div>
                  <div style="margin-top:10px; font-size:34px; line-height:1; letter-spacing:8px; font-weight:800; color:#0f5f8f;">
                    ${otpCode}
                  </div>
                  <div style="margin-top:14px; font-size:14px; color:#5f7690;">
                    Mã có hiệu lực trong <strong style="color:#16324f;">5 phút</strong>.
                  </div>
                </div>

                <div style="padding:14px 16px; border-radius:14px; background:#fff8ed; border:1px solid #f4d3a4; color:#8a540f; font-size:14px; line-height:1.6;">
                  Nếu bạn không thực hiện đăng ký tài khoản, vui lòng bỏ qua email này. Không chia sẻ mã OTP cho bất kỳ ai.
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
      subject: `Mã OTP đăng ký ${EMAIL_OTP_APP_NAME}`,
      text: `Mã OTP của bạn là ${otpCode}. Mã có hiệu lực trong 5 phút.`,
      html: buildOtpEmailHtml({ otpCode }),
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

export const sendEmailOtpMessage = async ({ email, otpCode, purpose }) => {
  if (EMAIL_OTP_PROVIDER === "resend") {
    return sendResendEmailOtp({ email, otpCode, purpose });
  }

  const error = new Error("EMAIL_OTP_PROVIDER không được hỗ trợ. Luồng đăng ký chỉ hỗ trợ gửi email thật qua Resend");
  error.statusCode = 500;
  throw error;
};
