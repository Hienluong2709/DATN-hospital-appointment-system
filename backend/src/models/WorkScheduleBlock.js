import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const WorkScheduleBlock = sequelize.define(
  "WorkScheduleBlock",
  {
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
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    is_off: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    start_time: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    end_time: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "work_schedule_blocks",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    validate: {
      validOffOrBlockTime() {
        const isOff = this.getDataValue("is_off");
        const startTime = this.getDataValue("start_time");
        const endTime = this.getDataValue("end_time");

        if (isOff) {
          if (startTime !== null || endTime !== null) {
            throw new Error("Ngày nghỉ (is_off=true) không được có start_time hoặc end_time");
          }

          return;
        }

        if (startTime === null || endTime === null) {
          throw new Error("Block time phải có đầy đủ start_time và end_time khi is_off=false");
        }

        if (startTime >= endTime) {
          throw new Error("start_time phải nhỏ hơn end_time");
        }
      },
    },
    indexes: [
      {
        name: "idx_wsb_doctor_date",
        fields: ["doctor_id", "date"],
      },
      {
        name: "idx_wsb_doctor_date_time",
        fields: ["doctor_id", "date", "start_time", "end_time"],
      },
    ],
  }
);

export default WorkScheduleBlock;