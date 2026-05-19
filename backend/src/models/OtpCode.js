import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const OtpCode = sequelize.define("OtpCode", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  code: {
    type: DataTypes.STRING(6),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(15),
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  purpose: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: "REGISTER",
  },
  expired_time: {
    type: DataTypes.DATE,
  },
  consumed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM("Pending", "Verified", "Consumed", "Expired"),
    defaultValue: "Pending",
  },
}, {
  tableName: "otp_codes",
  timestamps: false,
});

export default OtpCode;
