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
    allowNull: false,
  },
  expired_time: {
    type: DataTypes.DATE,
  },
  status: {
    type: DataTypes.ENUM("Pending", "Verified", "Expired"),
    defaultValue: "Pending",
  },
}, {
  tableName: "otp_codes",
  timestamps: false,
});

export default OtpCode;