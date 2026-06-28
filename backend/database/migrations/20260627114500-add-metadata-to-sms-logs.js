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
    if (!tableSet.has("sms_logs")) {
      return;
    }

    const columns = await queryInterface.describeTable("sms_logs");
    if (!columns.metadata) {
      await queryInterface.addColumn("sms_logs", "metadata", {
        type: Sequelize.JSON,
        allowNull: true,
        after: "error_message",
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));
    if (!tableSet.has("sms_logs")) {
      return;
    }

    const columns = await queryInterface.describeTable("sms_logs");
    if (columns.metadata) {
      await queryInterface.removeColumn("sms_logs", "metadata");
    }
  },
};
