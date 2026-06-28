"use strict";

const DOCTOR_DATE_QUEUE_NUMBER_UNIQUE_INDEX = "uq_queues_doctor_date_queue_number";

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

    if (!tableSet.has("queues")) {
      return;
    }

    const description = await queryInterface.describeTable("queues");

    if (!Object.prototype.hasOwnProperty.call(description, "doctor_id")) {
      await queryInterface.addColumn("queues", "doctor_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "doctors",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      });
    }

    if (!Object.prototype.hasOwnProperty.call(description, "date")) {
      await queryInterface.addColumn("queues", "date", {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE queues q
      INNER JOIN appointments a ON a.id = q.appointment_id
      SET q.doctor_id = a.doctor_id,
          q.date = a.date
      WHERE q.doctor_id IS NULL OR q.date IS NULL
    `);

    await queryInterface.changeColumn("queues", "doctor_id", {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: "doctors",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    await queryInterface.changeColumn("queues", "date", {
      type: Sequelize.DATEONLY,
      allowNull: false,
    });

    const indexes = await queryInterface.showIndex("queues");
    if (!hasIndexByName(indexes, DOCTOR_DATE_QUEUE_NUMBER_UNIQUE_INDEX)) {
      await queryInterface.addIndex("queues", ["doctor_id", "date", "queue_number"], {
        name: DOCTOR_DATE_QUEUE_NUMBER_UNIQUE_INDEX,
        unique: true,
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("queues")) {
      return;
    }

    const indexes = await queryInterface.showIndex("queues");
    if (hasIndexByName(indexes, DOCTOR_DATE_QUEUE_NUMBER_UNIQUE_INDEX)) {
      await queryInterface.removeIndex("queues", DOCTOR_DATE_QUEUE_NUMBER_UNIQUE_INDEX);
    }

    const description = await queryInterface.describeTable("queues");
    if (Object.prototype.hasOwnProperty.call(description, "date")) {
      await queryInterface.removeColumn("queues", "date");
    }

    if (Object.prototype.hasOwnProperty.call(description, "doctor_id")) {
      await queryInterface.removeColumn("queues", "doctor_id");
    }
  },
};
