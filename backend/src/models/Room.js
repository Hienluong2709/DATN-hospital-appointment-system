import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Room = sequelize.define(
  "Room",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },

    floor: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    specialty_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "specialties",
        key: "id",
      },
    },

    status: {
      type: DataTypes.ENUM("Available", "Maintenance"),
      defaultValue: "Available",
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "rooms",
    timestamps: false,
  },
);

export default Room;
