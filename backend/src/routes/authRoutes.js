import express from "express";
import {
  changePassword,
  login,
  logout,
  refreshSession,
  registerUser,
  resetPatientPassword,
  sendChangePasswordOtp,
  sendEmailOtp,
  sendPatientResetPasswordOtp,
  sendPhoneOtp,
  verifyChangePasswordOtp,
  verifyEmailOtp,
  verifyPatientResetPasswordOtp,
  verifyPhoneOtp,
} from "../controllers/authController.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/login", login);
router.post("/refresh", refreshSession);
router.post("/logout", logout);
router.post("/register", registerUser);
router.post("/otp/send", sendPhoneOtp);
router.post("/otp/verify", verifyPhoneOtp);
router.post("/otp/email/send", sendEmailOtp);
router.post("/otp/email/verify", verifyEmailOtp);
router.post("/forgot-password/otp/send", sendPatientResetPasswordOtp);
router.post("/forgot-password/otp/verify", verifyPatientResetPasswordOtp);
router.post("/forgot-password/reset", resetPatientPassword);
router.post("/change-password/otp/send", authenticate, sendChangePasswordOtp);
router.post("/change-password/otp/verify", authenticate, verifyChangePasswordOtp);
router.post("/change-password", authenticate, changePassword);

export default router;
