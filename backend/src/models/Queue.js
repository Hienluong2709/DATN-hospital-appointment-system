import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Queue = sequelize.define("Queue", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  appointment_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "appointments",
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
  queue_number: {
    type: DataTypes.INTEGER,
  },
  actual_start: {
    type: DataTypes.DATE,
  },
  actual_end: {
    type: DataTypes.DATE,
  },
  checked_in_at: {
    type: DataTypes.DATE,
  },
  original_estimated_start: {
    type: DataTypes.DATE,
  },
  estimated_start: {
    type: DataTypes.DATE,
  },
  forecast_updated_at: {
    type: DataTypes.DATE,
  },
  predicted_wait_minutes: {
    type: DataTypes.INTEGER,
  },
  latest_prediction_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: "queues",
  timestamps: false,
});

export default Queue;
