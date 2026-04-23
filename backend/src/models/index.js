import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sequelize from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = {};

const files = fs.readdirSync(__dirname);

for (const file of files) {
  if (file !== "index.js" && file !== "associations.js" && file.endsWith(".js")) {
    const model = (await import(`./${file}`)).default;
    db[model.name] = model;
  }
}

db.sequelize = sequelize;

export default db;