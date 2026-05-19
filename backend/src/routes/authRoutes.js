import express from "express";
import {
  changePassword,
  login,
  logout,
  refreshSession,
  registerUser,
  sendChangePasswordOtp,
  sendEmailOtp,
  sendPhoneOtp,
  verifyChangePasswordOtp,
  verifyEmailOtp,
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
router.post("/change-password/otp/send", authenticate, sendChangePasswordOtp);
router.post("/change-password/otp/verify", authenticate, verifyChangePasswordOtp);
router.post("/change-password", authenticate, changePassword);

export default router;
