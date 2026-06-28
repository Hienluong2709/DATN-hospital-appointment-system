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

const QUEUE_ESTIMATE_UPDATED_TEMPLATE = {
  code: "QUEUE_ESTIMATE_UPDATED",
  content:
    "Gio kham du kien cua ban duoc cap nhat thanh {{predicted_start_time}} tai {{room_display}}.",
  type: "SMS",
  is_active: true,
  description: "Thong bao khi gio kham du kien thay doi dang ke",
};

const QUEUE_SOON_CONTENT =
  "Du kien con {{predicted_wait_minutes}} phut den gio kham. Vui long o gan {{room_display}}.";

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("templates")) {
      return;
    }

    const [rows] = await queryInterface.sequelize.query(
      "SELECT code FROM templates WHERE code IN ('QUEUE_ESTIMATE_UPDATED', 'QUEUE_SOON')",
    );
    const existingCodes = new Set(rows.map((row) => row.code));

    if (!existingCodes.has(QUEUE_ESTIMATE_UPDATED_TEMPLATE.code)) {
      await queryInterface.bulkInsert("templates", [
        {
          ...QUEUE_ESTIMATE_UPDATED_TEMPLATE,
          created_at: new Date(),
        },
      ]);
    }

    if (existingCodes.has("QUEUE_SOON")) {
      await queryInterface.sequelize.query(
        "UPDATE templates SET content = :content WHERE code = 'QUEUE_SOON' AND type = 'SMS'",
        {
          replacements: {
            content: QUEUE_SOON_CONTENT,
          },
        },
      );
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("templates")) {
      return;
    }

    await queryInterface.bulkDelete("templates", {
      code: "QUEUE_ESTIMATE_UPDATED",
    });
  },
};
