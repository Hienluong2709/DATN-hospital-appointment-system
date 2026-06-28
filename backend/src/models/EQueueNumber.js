import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const EQueueNumber = sequelize.define("EQueueNumber", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  doctor_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: "doctors",
      key: "id",
    },
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  current_number: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: "equeue_numbers",
  timestamps: false,
});

export default EQueueNumber;