"use strict";

const DOCTOR_INDEX = "uq_appointments_active_doctor_slot";
const DOCTOR_ACTIVE_MARKER_COLUMN = "active_doctor_slot_key";

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

const resolveColumnNameSet = async (queryInterface) => {
  const description = await queryInterface.describeTable("appointments");
  return new Set(Object.keys(description));
};

const cancelDuplicateActiveDoctorSlots = async (queryInterface, dialect) => {
  if (dialect === "postgres") {
    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY doctor_id, date, time_slot
                 ORDER BY created_at ASC NULLS LAST, id ASC
               ) AS rn
        FROM appointments
        WHERE LOWER(status) <> 'cancelled'
      )
      UPDATE appointments
      SET status = 'Cancelled'
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    `);

    return;
  }

  await queryInterface.sequelize.query(`
    UPDATE appointments AS a
    INNER JOIN (
      SELECT id
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY doctor_id, date, time_slot
                 ORDER BY created_at ASC, id ASC
               ) AS rn
        FROM appointments
        WHERE LOWER(status) <> 'cancelled'
      ) AS ranked
      WHERE ranked.rn > 1
    ) AS d ON d.id = a.id
    SET a.status = 'Cancelled'
  `);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("appointments")) {
      return;
    }

    const dialect = queryInterface.sequelize.getDialect();
    const indexes = await queryInterface.showIndex("appointments");
    const hasDoctorIndex = hasIndexByName(indexes, DOCTOR_INDEX);

    if (hasDoctorIndex) {
      return;
    }

    await cancelDuplicateActiveDoctorSlots(queryInterface, dialect);

    if (dialect === "postgres") {
      await queryInterface.addIndex("appointments", ["doctor_id", "date", "time_slot"], {
        name: DOCTOR_INDEX,
        unique: true,
        where: {
          status: {
            [Sequelize.Op.ne]: "Cancelled",
          },
        },
      });

      return;
    }

    const columnNameSet = await resolveColumnNameSet(queryInterface);

    if (!columnNameSet.has(DOCTOR_ACTIVE_MARKER_COLUMN)) {
      await queryInterface.sequelize.query(`
        ALTER TABLE appointments
        ADD COLUMN ${DOCTOR_ACTIVE_MARKER_COLUMN}
        TINYINT GENERATED ALWAYS AS (
          CASE WHEN LOWER(status) <> 'cancelled' THEN 1 ELSE NULL END
        ) STORED
      `);
    }

    await queryInterface.addIndex(
      "appointments",
      ["doctor_id", "date", "time_slot", DOCTOR_ACTIVE_MARKER_COLUMN],
      {
        name: DOCTOR_INDEX,
        unique: true,
      }
    );
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("appointments")) {
      return;
    }

    const indexes = await queryInterface.showIndex("appointments");

    if (hasIndexByName(indexes, DOCTOR_INDEX)) {
      await queryInterface.removeIndex("appointments", DOCTOR_INDEX);
    }
  },
};
