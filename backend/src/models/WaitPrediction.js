import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const WaitPrediction = sequelize.define("WaitPrediction", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  queue_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "queues",
      key: "id",
    },
  },
  predicted_wait_time: {
    type: DataTypes.INTEGER,
  },
  predicted_start: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  prediction_source: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: "rule_engine",
  },
  model_version: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: "wait_predictions",
  timestamps: false,
});

export default WaitPrediction;
