import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Doctor = sequelize.define(
  "Doctor",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },

    specialty_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "specialties",
        key: "id",
      },
    },

    room_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "rooms",
        key: "id",
      },
    },

    description: {
      type: DataTypes.TEXT,
    },

    status: {
      type: DataTypes.ENUM("Active", "Inactive"),
      defaultValue: "Active",
    },
  },
  {
    tableName: "doctors",
    timestamps: false,
  }
);

export default Doctor;
