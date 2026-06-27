import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const SmsLog = sequelize.define("SmsLog", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  appointment_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: "appointments",
      key: "id",
    },
  },
  queue_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: "queues",
      key: "id",
    },
  },
  phone: {
    type: DataTypes.STRING(15),
  },
  template_code: {
    type: DataTypes.STRING(50),
  },
  event_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  content: {
    type: DataTypes.TEXT,
  },
  scheduled_at: {
    type: DataTypes.DATE,
  },
  sent_at: {
    type: DataTypes.DATE,
  },
  status: {
    type: DataTypes.ENUM("Pending", "Sent", "Failed"),
    defaultValue: "Pending",
  },
  provider_message_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: "sms_logs",
  timestamps: false,
});

export default SmsLog;
