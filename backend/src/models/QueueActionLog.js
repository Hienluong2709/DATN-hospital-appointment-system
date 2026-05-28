import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const QueueActionLog = sequelize.define("QueueActionLog", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  queue_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: "queues",
      key: "id",
    },
  },
  appointment_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "appointments",
      key: "id",
    },
  },
  actor_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: "users",
      key: "id",
    },
  },
  actor_role: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  action: {
    type: DataTypes.ENUM("CHECK_IN", "START_EXAM", "COMPLETE_EXAM", "NO_SHOW", "CANCEL_CHECK_IN"),
    allowNull: false,
  },
  from_status: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  to_status: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: "queue_action_logs",
  timestamps: false,
});

export default QueueActionLog;
