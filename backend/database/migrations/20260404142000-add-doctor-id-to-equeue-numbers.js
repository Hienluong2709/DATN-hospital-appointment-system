"use strict";

const DOCTOR_DATE_UNIQUE_INDEX = "uq_equeue_numbers_doctor_date";

const normalizeTableName = (table) => {
  if (typeof table === "string") {
    return table.toLowerCase();
  }

  if (table && typeof table === "object") {
    return String(table.tableName || table.TABLE_NAME || "").toLowerCase();
  }

  return "";
};

const hasIndexByName = (indexes, indexName) => {
  return indexes.some((index) => String(index.name || "").toLowerCase() === indexName.toLowerCase());
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("equeue_numbers")) {
      return;
    }

    const description = await queryInterface.describeTable("equeue_numbers");

    if (!Object.prototype.hasOwnProperty.call(description, "doctor_id")) {
      await queryInterface.addColumn("equeue_numbers", "doctor_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "doctors",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }

    const indexes = await queryInterface.showIndex("equeue_numbers");
    if (!hasIndexByName(indexes, DOCTOR_DATE_UNIQUE_INDEX)) {
      await queryInterface.addIndex("equeue_numbers", ["doctor_id", "date"], {
        name: DOCTOR_DATE_UNIQUE_INDEX,
        unique: true,
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("equeue_numbers")) {
      return;
    }

    const indexes = await queryInterface.showIndex("equeue_numbers");
    if (hasIndexByName(indexes, DOCTOR_DATE_UNIQUE_INDEX)) {
      await queryInterface.removeIndex("equeue_numbers", DOCTOR_DATE_UNIQUE_INDEX);
    }

    const description = await queryInterface.describeTable("equeue_numbers");
    if (Object.prototype.hasOwnProperty.call(description, "doctor_id")) {
      await queryInterface.removeColumn("equeue_numbers", "doctor_id");
    }
  },
};
