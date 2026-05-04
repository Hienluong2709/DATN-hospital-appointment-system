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

    if (!description.purpose) {
      await queryInterface.addColumn("otp_codes", "purpose", {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "REGISTER",
      });
    }

    if (!description.consumed_at) {
      await queryInterface.addColumn("otp_codes", "consumed_at", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE otp_codes
      SET purpose = COALESCE(NULLIF(purpose, ''), 'REGISTER')
    `);

    await queryInterface.changeColumn("otp_codes", "status", {
      type: Sequelize.ENUM("Pending", "Verified", "Consumed", "Expired"),
      allowNull: true,
      defaultValue: "Pending",
    });
  },

  async down(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("otp_codes")) {
      return;
    }

    const description = await queryInterface.describeTable("otp_codes");

    await queryInterface.sequelize.query(`
      UPDATE otp_codes
      SET status = 'Expired'
      WHERE status = 'Consumed'
    `);

    await queryInterface.changeColumn("otp_codes", "status", {
      type: Sequelize.ENUM("Pending", "Verified", "Expired"),
      allowNull: true,
      defaultValue: "Pending",
    });

    if (description.consumed_at) {
      await queryInterface.removeColumn("otp_codes", "consumed_at");
    }

    if (description.purpose) {
      await queryInterface.removeColumn("otp_codes", "purpose");
    }
  },
};
