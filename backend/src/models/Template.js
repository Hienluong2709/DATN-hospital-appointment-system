import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Template = sequelize.define("Template", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  content: {
    type: DataTypes.TEXT,
  },
  type: {
    type: DataTypes.ENUM("SMS", "EMAIL"),
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  description: {
    type: DataTypes.TEXT,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: "templates",
  timestamps: false,
});

export default Template;