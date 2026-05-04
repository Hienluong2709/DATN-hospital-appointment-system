import express from "express";
import {
  changePassword,
  login,
  registerUser,
  sendChangePasswordOtp,
  sendPhoneOtp,
  verifyChangePasswordOtp,
  verifyPhoneOtp,
} from "../controllers/authController.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/login", login);
router.post("/register", registerUser);
router.post("/otp/send", sendPhoneOtp);
router.post("/otp/verify", verifyPhoneOtp);
router.post("/change-password/otp/send", authenticate, sendChangePasswordOtp);
router.post("/change-password/otp/verify", authenticate, verifyChangePasswordOtp);
router.post("/change-password", authenticate, changePassword);

export default router;
