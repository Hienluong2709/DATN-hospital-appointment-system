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

    if (tableSet.has("queues")) {
      await queryInterface.addColumn("queues", "original_estimated_start", {
        type: Sequelize.DATE,
        allowNull: true,
      });

      await queryInterface.addColumn("queues", "forecast_updated_at", {
        type: Sequelize.DATE,
        allowNull: true,
      });

      await queryInterface.addColumn("queues", "latest_prediction_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });

      await queryInterface.addIndex("queues", ["latest_prediction_id"], {
        name: "idx_queues_latest_prediction_id",
      });
    }

    if (tableSet.has("wait_predictions")) {
      await queryInterface.addColumn("wait_predictions", "predicted_start", {
        type: Sequelize.DATE,
        allowNull: true,
      });

      await queryInterface.addColumn("wait_predictions", "prediction_source", {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "rule_engine",
      });

      await queryInterface.addColumn("wait_predictions", "model_version", {
        type: Sequelize.STRING(100),
        allowNull: true,
      });

      await queryInterface.addIndex("wait_predictions", ["queue_id", "created_at"], {
        name: "idx_wait_predictions_queue_created_at",
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (tableSet.has("queues")) {
      await queryInterface.removeIndex("queues", "idx_queues_latest_prediction_id");
      await queryInterface.removeColumn("queues", "latest_prediction_id");
      await queryInterface.removeColumn("queues", "forecast_updated_at");
      await queryInterface.removeColumn("queues", "original_estimated_start");
    }

    if (tableSet.has("wait_predictions")) {
      await queryInterface.removeIndex("wait_predictions", "idx_wait_predictions_queue_created_at");
      await queryInterface.removeColumn("wait_predictions", "model_version");
      await queryInterface.removeColumn("wait_predictions", "prediction_source");
      await queryInterface.removeColumn("wait_predictions", "predicted_start");
    }
  },
};
