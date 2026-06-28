"use strict";

const normalizeTableName = (table) => {
  if (typeof table === "string") {
    return table.toLowerCase();
  }

  if (table && typeof table === "object") {
    return String(table.tableName || table.TABLE_NAME || "").toLowerCase();
  }

  return "";
};

const indexName = "idx_work_schedules_doctor_day_time";

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("work_schedules")) {
      return;
    }

    const indexes = await queryInterface.showIndex("work_schedules");
    const hasIndex = indexes.some((index) => String(index.name || "").toLowerCase() === indexName);

    if (!hasIndex) {
      await queryInterface.addIndex("work_schedules", ["doctor_id", "day_of_week", "start_time", "end_time"], {
        name: indexName,
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("work_schedules")) {
      return;
    }

    const indexes = await queryInterface.showIndex("work_schedules");
    const hasIndex = indexes.some((index) => String(index.name || "").toLowerCase() === indexName);

    if (hasIndex) {
      await queryInterface.removeIndex("work_schedules", indexName);
    }
  },
};
