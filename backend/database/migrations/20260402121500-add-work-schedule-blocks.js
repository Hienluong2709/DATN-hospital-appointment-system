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
      await queryInterface.createTable("work_schedule_blocks", {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        doctor_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "doctors", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        date: {
          type: Sequelize.DATEONLY,
          allowNull: false,
        },
        is_off: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        start_time: {
          type: Sequelize.TIME,
          allowNull: true,
        },
        end_time: {
          type: Sequelize.TIME,
          allowNull: true,
        },
        reason: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
      });
    }

    const indexes = await queryInterface.showIndex("work_schedule_blocks");
    const hasDoctorDateIndex = indexes.some(
      (index) => String(index.name || "").toLowerCase() === "idx_wsb_doctor_date"
    );
    const hasDoctorDateTimeIndex = indexes.some(
      (index) => String(index.name || "").toLowerCase() === "idx_wsb_doctor_date_time"
    );

    if (!hasDoctorDateIndex) {
      await queryInterface.addIndex("work_schedule_blocks", ["doctor_id", "date"], {
        name: "idx_wsb_doctor_date",
      });
    }

    if (!hasDoctorDateTimeIndex) {
      await queryInterface.addIndex(
        "work_schedule_blocks",
        ["doctor_id", "date", "start_time", "end_time"],
        {
          name: "idx_wsb_doctor_date_time",
        }
      );
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("work_schedule_blocks")) {
      return;
    }

    const indexes = await queryInterface.showIndex("work_schedule_blocks");
    const hasDoctorDateIndex = indexes.some(
      (index) => String(index.name || "").toLowerCase() === "idx_wsb_doctor_date"
    );
    const hasDoctorDateTimeIndex = indexes.some(
      (index) => String(index.name || "").toLowerCase() === "idx_wsb_doctor_date_time"
    );

    if (hasDoctorDateTimeIndex) {
      await queryInterface.removeIndex("work_schedule_blocks", "idx_wsb_doctor_date_time");
    }

    if (hasDoctorDateIndex) {
      await queryInterface.removeIndex("work_schedule_blocks", "idx_wsb_doctor_date");
    }

    await queryInterface.dropTable("work_schedule_blocks");
  },
};