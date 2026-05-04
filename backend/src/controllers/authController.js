import {
  changePasswordService,
  loginService,
  registerUserService,
} from "../services/authService.js";
import {
  sendPhoneOtpCodeService,
  verifyPhoneOtpCodeService,
} from "../services/otpService.js";

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const data = await loginService(username, password);

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
