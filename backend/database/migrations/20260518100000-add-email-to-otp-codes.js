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

    if (!tableSet.has("otp_codes")) {
      return;
    }

    const description = await queryInterface.describeTable("otp_codes");

    if (!description.email) {
      await queryInterface.addColumn("otp_codes", "email", {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }

    if (description.phone?.allowNull === false) {
      await queryInterface.changeColumn("otp_codes", "phone", {
        type: Sequelize.STRING(15),
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("otp_codes")) {
      return;
    }

    const description = await queryInterface.describeTable("otp_codes");

    await queryInterface.sequelize.query(`
      DELETE FROM otp_codes
      WHERE phone IS NULL
    `);

    await queryInterface.changeColumn("otp_codes", "phone", {
      type: Sequelize.STRING(15),
      allowNull: false,
    });

    if (description.email) {
      await queryInterface.removeColumn("otp_codes", "email");
    }
  },
};
