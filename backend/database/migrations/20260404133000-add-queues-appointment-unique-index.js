"use strict";

const QUEUE_APPOINTMENT_UNIQUE_INDEX = "uq_queues_appointment_id";

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
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("queues")) {
      return;
    }

    const indexes = await queryInterface.showIndex("queues");
    if (hasIndexByName(indexes, QUEUE_APPOINTMENT_UNIQUE_INDEX)) {
      return;
    }

    const [duplicates] = await queryInterface.sequelize.query(`
      SELECT appointment_id, COUNT(*) AS duplicate_count
      FROM queues
      GROUP BY appointment_id
      HAVING COUNT(*) > 1
      LIMIT 5
    `);

    if (duplicates.length > 0) {
      const sample = duplicates
        .map((row) => `appointment_id=${row.appointment_id} (count=${row.duplicate_count})`)
        .join(", ");
      throw new Error(
        `Không thể tạo unique index cho queues.appointment_id vì đã có dữ liệu trùng: ${sample}`
      );
    }

    await queryInterface.addIndex("queues", ["appointment_id"], {
      name: QUEUE_APPOINTMENT_UNIQUE_INDEX,
      unique: true,
    });
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("queues")) {
      return;
    }

    const indexes = await queryInterface.showIndex("queues");
    if (!hasIndexByName(indexes, QUEUE_APPOINTMENT_UNIQUE_INDEX)) {
      return;
    }

    await queryInterface.removeIndex("queues", QUEUE_APPOINTMENT_UNIQUE_INDEX);
  },
};
