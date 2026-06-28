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

    await queryInterface.sequelize.query(
      "UPDATE appointments SET status = 'Confirmed' WHERE status = 'Pending'"
    );

    await queryInterface.changeColumn("appointments", "status", {
      type: Sequelize.ENUM("Confirmed", "Cancelled", "Completed"),
      allowNull: false,
      defaultValue: "Confirmed",
    });
  },

  async down(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("appointments")) {
      return;
    }

    await queryInterface.sequelize.query(
      "UPDATE appointments SET status = 'Confirmed' WHERE status = 'Completed'"
    );

    await queryInterface.changeColumn("appointments", "status", {
      type: Sequelize.ENUM("Pending", "Confirmed", "Cancelled"),
      allowNull: false,
      defaultValue: "Pending",
    });
  },
};
