import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Appointment = sequelize.define("Appointment", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  patient_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "users",
      key: "id",
    },
  },
  doctor_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "doctors",
      key: "id",
    },
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  reason: {
    type: DataTypes.TEXT,
  },
  time_slot: {
    type: DataTypes.TIME,
  },
  preferred_period: {
    type: DataTypes.ENUM("MORNING", "AFTERNOON"),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM("Pending", "Confirmed", "CheckedIn", "Cancelled", "Completed", "NoShow"),
    defaultValue: "Pending",
  },
  hold_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: "appointments",
  timestamps: false,
});

export default Appointment;
