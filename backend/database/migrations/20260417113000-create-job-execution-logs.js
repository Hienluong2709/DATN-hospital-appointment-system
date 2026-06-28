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

    if (!tableSet.has("job_execution_logs")) {
      await queryInterface.createTable("job_execution_logs", {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        job_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        target_date: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        trigger_type: {
          type: Sequelize.ENUM("scheduler", "manual"),
          allowNull: false,
          defaultValue: "scheduler",
        },
        dry_run: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        status: {
          type: Sequelize.ENUM("Running", "Succeeded", "Failed"),
          allowNull: false,
          defaultValue: "Running",
        },
        started_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        finished_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        summary_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        error_message: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
      });

      await queryInterface.addIndex("job_execution_logs", ["job_name", "target_date"], {
        name: "idx_job_execution_logs_job_name_target_date",
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (tableSet.has("job_execution_logs")) {
      await queryInterface.dropTable("job_execution_logs");
    }
  },
};
