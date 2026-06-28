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

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("work_schedule_blocks")) {
      return;
    }

    const describe = await queryInterface.describeTable("work_schedule_blocks");

    if (!describe.created_at) {
      await queryInterface.addColumn("work_schedule_blocks", "created_at", {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      });
    }

    if (!describe.updated_at) {
      await queryInterface.addColumn("work_schedule_blocks", "updated_at", {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("work_schedule_blocks")) {
      return;
    }

    const describe = await queryInterface.describeTable("work_schedule_blocks");

    if (describe.updated_at) {
      await queryInterface.removeColumn("work_schedule_blocks", "updated_at");
    }

    if (describe.created_at) {
      await queryInterface.removeColumn("work_schedule_blocks", "created_at");
    }
  },
};
