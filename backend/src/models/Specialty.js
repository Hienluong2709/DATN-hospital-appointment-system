import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Specialty = sequelize.define("Specialty", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
  },
}, {
  tableName: "specialties",
  timestamps: false,
});

export default Specialty;