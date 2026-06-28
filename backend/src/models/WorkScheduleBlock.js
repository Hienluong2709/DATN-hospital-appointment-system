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
    requested_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
    reviewed_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("Pending", "Approved", "Rejected"),
      allowNull: false,
      defaultValue: "Approved",
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
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    review_note: {
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
        const status = this.getDataValue("status");
        const isOff = this.getDataValue("is_off");
        const startTime = this.getDataValue("start_time");
        const endTime = this.getDataValue("end_time");
        const reviewedAt = this.getDataValue("reviewed_at");
        const reviewedByUserId = this.getDataValue("reviewed_by_user_id");

        if (!["Pending", "Approved", "Rejected"].includes(status)) {
          throw new Error("status không hợp lệ");
        }

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

        if (status === "Pending" && (reviewedAt !== null || reviewedByUserId !== null)) {
          throw new Error("Yêu cầu chờ duyệt không được có thông tin xét duyệt");
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
