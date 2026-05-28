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

const getTableSet = async (queryInterface) => {
  const tables = await queryInterface.showAllTables();
  return new Set(tables.map(normalizeTableName).filter(Boolean));
};

const getColumnSet = async (queryInterface, tableName) => {
  const columns = await queryInterface.describeTable(tableName);
  return new Set(Object.keys(columns));
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await getTableSet(queryInterface);

    if (tables.has("appointments")) {
      const appointmentColumns = await getColumnSet(queryInterface, "appointments");

      if (!appointmentColumns.has("priority_level")) {
        await queryInterface.addColumn("appointments", "priority_level", {
          type: Sequelize.ENUM("Normal", "Priority", "Emergency"),
          allowNull: false,
          defaultValue: "Normal",
          after: "preferred_period",
        });
      }

      if (!appointmentColumns.has("no_show_note")) {
        await queryInterface.addColumn("appointments", "no_show_note", {
          type: Sequelize.TEXT,
          allowNull: true,
          after: "status",
        });
      }
    }

    if (!tables.has("queue_action_logs")) {
      await queryInterface.createTable("queue_action_logs", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        queue_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "queues", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        appointment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "appointments", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        actor_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        actor_role: { type: Sequelize.STRING(30), allowNull: true },
        action: {
          type: Sequelize.ENUM("CHECK_IN", "START_EXAM", "COMPLETE_EXAM", "NO_SHOW", "CANCEL_CHECK_IN"),
          allowNull: false,
        },
        from_status: { type: Sequelize.STRING(30), allowNull: true },
        to_status: { type: Sequelize.STRING(30), allowNull: true },
        note: { type: Sequelize.TEXT, allowNull: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      });

      await queryInterface.addIndex("queue_action_logs", ["appointment_id", "created_at"], {
        name: "idx_queue_action_logs_appointment_created_at",
      });
      await queryInterface.addIndex("queue_action_logs", ["queue_id", "created_at"], {
        name: "idx_queue_action_logs_queue_created_at",
      });
      await queryInterface.addIndex("queue_action_logs", ["actor_user_id", "created_at"], {
        name: "idx_queue_action_logs_actor_created_at",
      });
    }
  },

  async down(queryInterface) {
    const tables = await getTableSet(queryInterface);

    if (tables.has("queue_action_logs")) {
      await queryInterface.dropTable("queue_action_logs");
    }

    if (tables.has("appointments")) {
      const appointmentColumns = await getColumnSet(queryInterface, "appointments");

      if (appointmentColumns.has("no_show_note")) {
        await queryInterface.removeColumn("appointments", "no_show_note");
      }

      if (appointmentColumns.has("priority_level")) {
        await queryInterface.removeColumn("appointments", "priority_level");
      }
    }
  },
};
