import {
  changePasswordService,
  loginService,
  logoutService,
  refreshSessionService,
  registerUserService,
  resetPatientPasswordService,
  sendChangePasswordOtpService,
  sendPatientResetPasswordOtpService,
  verifyPatientResetPasswordOtpService,
  verifyChangePasswordOtpService,
} from "../services/authService.js";
import {
  sendEmailOtpCodeService,
  sendPhoneOtpCodeService,
  verifyEmailOtpCodeService,
  verifyPhoneOtpCodeService,
} from "../services/otpService.js";

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const data = await loginService(username, password, {
      userAgent: req.get("user-agent"),
      ipAddress: req.ip,
    });

    res.json({
      message: "Login thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Đăng nhập thất bại, vui lòng thử lại" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};

export const refreshSession = async (req, res) => {
  try {
    const data = await refreshSessionService(req.body, {
      userAgent: req.get("user-agent"),
      ipAddress: req.ip,
    });

    res.json({
      message: "Làm mới phiên đăng nhập thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Không thể làm mới phiên đăng nhập" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};

export const logout = async (req, res) => {
  try {
    const data = await logoutService(req.body);

    res.json({
      message: "Đăng xuất thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Không thể đăng xuất" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};

export const registerUser = async (req, res) => {
  try {
    const data = await registerUserService(req.body);

    res.status(201).json({
      message: "Tạo user thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Tạo user thất bại, vui lòng thử lại" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    const data = await changePasswordService(req.user?.id, req.body);

    res.json({
      message: "Đổi mật khẩu thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Đổi mật khẩu thất bại, vui lòng thử lại" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};

export const sendPhoneOtp = async (req, res) => {
  try {
    const data = await sendPhoneOtpCodeService(req.body);

    res.status(201).json({
      message: "Gửi OTP thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Gửi OTP thất bại, vui lòng thử lại" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};

export const sendEmailOtp = async (req, res) => {
  try {
    const data = await sendEmailOtpCodeService(req.body);

    res.status(201).json({
      message: "Gửi OTP thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Gửi OTP thất bại, vui lòng thử lại" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};

export const verifyPhoneOtp = async (req, res) => {
  try {
    const data = await verifyPhoneOtpCodeService(req.body);

    res.json({
      message: "Xác thực OTP thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Xác thực OTP thất bại, vui lòng thử lại" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};

export const verifyEmailOtp = async (req, res) => {
  try {
    const data = await verifyEmailOtpCodeService(req.body);

    res.json({
      message: "Xác thực OTP thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Xác thực OTP thất bại, vui lòng thử lại" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};

export const sendChangePasswordOtp = async (req, res) => {
  try {
    const data = await sendChangePasswordOtpService(req.user?.id);

    res.status(201).json({
      message: "Gửi OTP đổi mật khẩu thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Gửi OTP thất bại, vui lòng thử lại" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};

export const verifyChangePasswordOtp = async (req, res) => {
  try {
    const data = await verifyChangePasswordOtpService(req.user?.id, req.body);

    res.json({
      message: "Xác thực OTP đổi mật khẩu thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Xác thực OTP thất bại, vui lòng thử lại" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};

export const sendPatientResetPasswordOtp = async (req, res) => {
  try {
    const data = await sendPatientResetPasswordOtpService(req.body);

    res.status(201).json({
      message: "Gửi OTP đặt lại mật khẩu thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Gửi OTP thất bại, vui lòng thử lại" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};

export const verifyPatientResetPasswordOtp = async (req, res) => {
  try {
    const data = await verifyPatientResetPasswordOtpService(req.body);

    res.json({
      message: "Xác thực OTP đặt lại mật khẩu thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Xác thực OTP thất bại, vui lòng thử lại" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};

export const resetPatientPassword = async (req, res) => {
  try {
    const data = await resetPatientPasswordService(req.body);

    res.json({
      message: "Đặt lại mật khẩu thành công",
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Đặt lại mật khẩu thất bại, vui lòng thử lại" : error.message;

    res.status(statusCode).json({
      message,
    });
  }
};
