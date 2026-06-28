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

    if (!tableSet.has("appointments")) {
      return;
    }

    const tableDefinition = await queryInterface.describeTable("appointments");
    if (tableDefinition.preferred_period) {
      return;
    }

    await queryInterface.addColumn("appointments", "preferred_period", {
      type: Sequelize.ENUM("MORNING", "AFTERNOON"),
      allowNull: true,
      after: "time_slot",
    });
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("appointments")) {
      return;
    }

    const tableDefinition = await queryInterface.describeTable("appointments");
    if (!tableDefinition.preferred_period) {
      return;
    }

    await queryInterface.removeColumn("appointments", "preferred_period");
  },
};
