import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const DB_TIMEZONE = process.env.DB_TIMEZONE || "+07:00";

const sequelize = new Sequelize(
  process.env.DB_NAME,     
  process.env.DB_USER,     
  process.env.DB_PASS,   
  {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    dialect: "mysql",
    timezone: DB_TIMEZONE,
    dialectOptions: {
      timezone: DB_TIMEZONE,
    },
    logging: false,         
  }
);

export default sequelize;