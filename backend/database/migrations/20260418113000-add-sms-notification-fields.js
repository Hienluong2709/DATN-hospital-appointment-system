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

const CHECKIN_ESTIMATE_TEMPLATE = {
  code: "CHECKIN_ESTIMATE",
  content:
    "Ban da check-in. Du kien vao kham luc {{predicted_start_time}} tai {{room_display}}.",
  type: "SMS",
  is_active: true,
  description: "Thong bao du kien vao kham ngay sau khi check-in",
};

const QUEUE_SOON_TEMPLATE = {
  code: "QUEUE_SOON",
  content:
    "Du kien con {{predicted_wait_minutes}} phut den luot kham. Vui long o gan {{room_display}}.",
  type: "SMS",
  is_active: true,
  description: "Thong bao sap den luot kham",
};

const QUEUE_READY_TEMPLATE = {
  code: "QUEUE_READY",
  content: "Da den luot kham. Vui long vao {{room_display}}.",
  type: "SMS",
  is_active: true,
  description: "Thong bao den luot kham",
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (tableSet.has("sms_logs")) {
      await queryInterface.addColumn("sms_logs", "appointment_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "appointments",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });

      await queryInterface.addColumn("sms_logs", "queue_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "queues",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });

      await queryInterface.addColumn("sms_logs", "event_code", {
        type: Sequelize.STRING(50),
        allowNull: true,
      });

      await queryInterface.addColumn("sms_logs", "provider_message_id", {
        type: Sequelize.STRING(100),
        allowNull: true,
      });

      await queryInterface.addColumn("sms_logs", "error_message", {
        type: Sequelize.TEXT,
        allowNull: true,
      });

      await queryInterface.sequelize.query(`
        UPDATE sms_logs
        SET event_code = template_code
        WHERE event_code IS NULL AND template_code IS NOT NULL
      `);

      await queryInterface.addIndex("sms_logs", ["appointment_id"], {
        name: "idx_sms_logs_appointment_id",
      });

      await queryInterface.addIndex("sms_logs", ["queue_id"], {
        name: "idx_sms_logs_queue_id",
      });

      await queryInterface.addIndex("sms_logs", ["queue_id", "event_code"], {
        name: "uq_sms_logs_queue_event",
        unique: true,
      });
    }

    if (tableSet.has("templates")) {
      const [rows] = await queryInterface.sequelize.query(
        `SELECT code FROM templates WHERE code IN ('CHECKIN_ESTIMATE', 'QUEUE_SOON', 'QUEUE_READY')`
      );
      const existingCodes = new Set(rows.map((row) => row.code));
      const now = new Date();
      const missingTemplates = [];

      if (!existingCodes.has(CHECKIN_ESTIMATE_TEMPLATE.code)) {
        missingTemplates.push({
          ...CHECKIN_ESTIMATE_TEMPLATE,
          created_at: now,
        });
      }

      if (!existingCodes.has(QUEUE_SOON_TEMPLATE.code)) {
        missingTemplates.push({
          ...QUEUE_SOON_TEMPLATE,
          created_at: now,
        });
      }

      if (!existingCodes.has(QUEUE_READY_TEMPLATE.code)) {
        missingTemplates.push({
          ...QUEUE_READY_TEMPLATE,
          created_at: now,
        });
      }

      if (missingTemplates.length > 0) {
        await queryInterface.bulkInsert("templates", missingTemplates);
      }
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (tableSet.has("sms_logs")) {
      await queryInterface.removeIndex("sms_logs", "uq_sms_logs_queue_event");
      await queryInterface.removeIndex("sms_logs", "idx_sms_logs_queue_id");
      await queryInterface.removeIndex("sms_logs", "idx_sms_logs_appointment_id");
      await queryInterface.removeColumn("sms_logs", "error_message");
      await queryInterface.removeColumn("sms_logs", "provider_message_id");
      await queryInterface.removeColumn("sms_logs", "event_code");
      await queryInterface.removeColumn("sms_logs", "queue_id");
      await queryInterface.removeColumn("sms_logs", "appointment_id");
    }

    if (tableSet.has("templates")) {
      await queryInterface.bulkDelete("templates", {
        code: ["CHECKIN_ESTIMATE", "QUEUE_SOON"],
      });
    }
  },
};
