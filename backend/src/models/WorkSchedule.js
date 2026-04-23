import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const WorkSchedule = sequelize.define("WorkSchedule", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  doctor_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "doctors",
      key: "id",
    },
  },
  day_of_week: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  start_time: {
    type: DataTypes.TIME,
  },
  end_time: {
    type: DataTypes.TIME,
  },
}, {
  tableName: "work_schedules",
  timestamps: false,
  indexes: [
    {
      name: "idx_work_schedules_doctor_day_time",
      fields: ["doctor_id", "day_of_week", "start_time", "end_time"],
    },
  ],
});

export default WorkSchedule;