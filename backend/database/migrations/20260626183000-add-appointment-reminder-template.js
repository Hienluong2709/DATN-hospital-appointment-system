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

const APPOINTMENT_REMINDER_TEMPLATE = {
  code: "APPOINTMENT_REMINDER_1H",
  content:
    "Ban co lich kham luc {{appointment_time}} voi bac si {{doctor_name}} tai {{room_display}}. Vui long den dung gio de check-in.",
  type: "SMS",
  is_active: true,
  description: "Thong bao truoc 1 tieng cho lich kham chua check-in",
};

const APPOINTMENT_EVENT_INDEX = "idx_sms_logs_appointment_event";

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (tableSet.has("templates")) {
      const [rows] = await queryInterface.sequelize.query(
        "SELECT code FROM templates WHERE code = 'APPOINTMENT_REMINDER_1H'",
      );

      if (rows.length === 0) {
        await queryInterface.bulkInsert("templates", [
          {
            ...APPOINTMENT_REMINDER_TEMPLATE,
            created_at: new Date(),
          },
        ]);
      }
    }

    if (tableSet.has("sms_logs")) {
      const indexes = await queryInterface.showIndex("sms_logs");
      const hasAppointmentEventIndex = indexes.some(
        (index) => index.name === APPOINTMENT_EVENT_INDEX,
      );

      if (!hasAppointmentEventIndex) {
        await queryInterface.addIndex("sms_logs", ["appointment_id", "event_code"], {
          name: APPOINTMENT_EVENT_INDEX,
        });
      }
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (tableSet.has("sms_logs")) {
      const indexes = await queryInterface.showIndex("sms_logs");
      const hasAppointmentEventIndex = indexes.some(
        (index) => index.name === APPOINTMENT_EVENT_INDEX,
      );

      if (hasAppointmentEventIndex) {
        await queryInterface.removeIndex("sms_logs", APPOINTMENT_EVENT_INDEX);
      }
    }

    if (tableSet.has("templates")) {
      await queryInterface.bulkDelete("templates", {
        code: "APPOINTMENT_REMINDER_1H",
      });
    }
  },
};
