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

const DOCTOR_INDEX = "uq_appointments_active_doctor_slot";
const PATIENT_INDEX = "uq_appointments_active_patient_slot";
const DOCTOR_ACTIVE_MARKER_COLUMN = "active_doctor_slot_key";
const PATIENT_ACTIVE_MARKER_COLUMN = "active_patient_slot_key";

const hasIndexByName = (indexes, indexName) => {
  return indexes.some((index) => String(index.name || "").toLowerCase() === indexName.toLowerCase());
};

const hasColumnByName = async (queryInterface, tableName, columnName) => {
  const description = await queryInterface.describeTable(tableName);
  return Object.prototype.hasOwnProperty.call(description, columnName);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("appointments")) {
      return;
    }

    const hasHoldExpiresAt = await hasColumnByName(queryInterface, "appointments", "hold_expires_at");
    if (!hasHoldExpiresAt) {
      await queryInterface.addColumn("appointments", "hold_expires_at", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    await queryInterface.changeColumn("appointments", "status", {
      type: Sequelize.ENUM("Pending", "Confirmed", "Cancelled", "Completed"),
      allowNull: false,
      defaultValue: "Pending",
    });

    const dialect = queryInterface.sequelize.getDialect();

    // MySQL may bind FK support to these indexes, so keep existing indexes untouched.
    // Existing index strategy still locks active slots for Pending/Confirmed flows.
    if (dialect !== "postgres") {
      return;
    }

    const indexes = await queryInterface.showIndex("appointments");

    if (hasIndexByName(indexes, PATIENT_INDEX)) {
      await queryInterface.removeIndex("appointments", PATIENT_INDEX);
    }

    if (hasIndexByName(indexes, DOCTOR_INDEX)) {
      await queryInterface.removeIndex("appointments", DOCTOR_INDEX);
    }

    await queryInterface.addIndex("appointments", ["doctor_id", "date", "time_slot"], {
      name: DOCTOR_INDEX,
      unique: true,
      where: {
        status: {
          [Sequelize.Op.in]: ["Pending", "Confirmed"],
        },
      },
    });

    await queryInterface.addIndex("appointments", ["patient_id", "date", "time_slot"], {
      name: PATIENT_INDEX,
      unique: true,
      where: {
        status: {
          [Sequelize.Op.in]: ["Pending", "Confirmed"],
        },
      },
    });
  },

  async down(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("appointments")) {
      return;
    }

    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === "postgres") {
      const indexes = await queryInterface.showIndex("appointments");

      if (hasIndexByName(indexes, PATIENT_INDEX)) {
        await queryInterface.removeIndex("appointments", PATIENT_INDEX);
      }

      if (hasIndexByName(indexes, DOCTOR_INDEX)) {
        await queryInterface.removeIndex("appointments", DOCTOR_INDEX);
      }

      await queryInterface.addIndex("appointments", ["doctor_id", "date", "time_slot"], {
        name: DOCTOR_INDEX,
        unique: true,
        where: {
          status: {
            [Sequelize.Op.ne]: "Cancelled",
          },
        },
      });

      await queryInterface.addIndex("appointments", ["patient_id", "date", "time_slot"], {
        name: PATIENT_INDEX,
        unique: true,
        where: {
          status: {
            [Sequelize.Op.ne]: "Cancelled",
          },
        },
      });
    }

    const hasHoldExpiresAt = await hasColumnByName(queryInterface, "appointments", "hold_expires_at");
    if (hasHoldExpiresAt) {
      await queryInterface.removeColumn("appointments", "hold_expires_at");
    }

    await queryInterface.changeColumn("appointments", "status", {
      type: Sequelize.ENUM("Confirmed", "Cancelled", "Completed"),
      allowNull: false,
      defaultValue: "Confirmed",
    });
  },
};
