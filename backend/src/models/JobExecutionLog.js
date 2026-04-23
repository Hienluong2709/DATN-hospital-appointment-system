import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const JobExecutionLog = sequelize.define("JobExecutionLog", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  job_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  target_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  trigger_type: {
    type: DataTypes.ENUM("scheduler", "manual"),
    allowNull: false,
    defaultValue: "scheduler",
  },
  dry_run: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  status: {
    type: DataTypes.ENUM("Running", "Succeeded", "Failed"),
    allowNull: false,
    defaultValue: "Running",
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  finished_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  summary_json: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: "job_execution_logs",
  timestamps: false,
});

export default JobExecutionLog;
