import jwt from "jsonwebtoken";
import db from "../models/index.js";

const { User } = db;
const DEFAULT_JWT_ISSUER = "sofitech-hospital-api";
const DEFAULT_JWT_AUDIENCE = "sofitech-clinic-platform";

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Không có token" });
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Token không hợp lệ" });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ message: "Server chưa cấu hình JWT_SECRET" });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret, {
      issuer: process.env.JWT_ISSUER || DEFAULT_JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE || DEFAULT_JWT_AUDIENCE,
    });
    const user = await User.findByPk(decoded.id, {
      attributes: ["id", "role", "status"],
    });

    if (!user) {
      return res.status(401).json({ message: "Người dùng không tồn tại" });
    }

    if (user.status === "Inactive") {
      return res.status(403).json({ message: "Tài khoản đã bị khóa" });
    }

    req.user = {
      id: user.id,
      role: user.role,
      status: user.status,
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token không hợp lệ" });
  }
};

export const authorize = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
};
