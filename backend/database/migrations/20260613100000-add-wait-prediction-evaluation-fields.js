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

const getColumnSet = async (queryInterface, tableName) => {
  const columns = await queryInterface.describeTable(tableName);
  return new Set(Object.keys(columns));
};

const getIndexSet = async (queryInterface, tableName) => {
  const indexes = await queryInterface.showIndex(tableName);
  return new Set(indexes.map((index) => index.name).filter(Boolean));
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("wait_predictions")) {
      return;
    }

    const columns = await getColumnSet(queryInterface, "wait_predictions");

    if (!columns.has("rule_wait_minutes")) {
      await queryInterface.addColumn("wait_predictions", "rule_wait_minutes", {
        type: Sequelize.INTEGER,
        allowNull: true,
        after: "predicted_wait_time",
      });
    }

    if (!columns.has("feature_snapshot")) {
      await queryInterface.addColumn("wait_predictions", "feature_snapshot", {
        type: Sequelize.JSON,
        allowNull: true,
        after: "model_version",
      });
    }

    if (!columns.has("actual_wait_minutes")) {
      await queryInterface.addColumn("wait_predictions", "actual_wait_minutes", {
        type: Sequelize.INTEGER,
        allowNull: true,
        after: "feature_snapshot",
      });
    }

    if (!columns.has("absolute_error_minutes")) {
      await queryInterface.addColumn("wait_predictions", "absolute_error_minutes", {
        type: Sequelize.INTEGER,
        allowNull: true,
        after: "actual_wait_minutes",
      });
    }

    if (!columns.has("evaluated_at")) {
      await queryInterface.addColumn("wait_predictions", "evaluated_at", {
        type: Sequelize.DATE,
        allowNull: true,
        after: "absolute_error_minutes",
      });
    }

    const indexes = await getIndexSet(queryInterface, "wait_predictions");
    if (!indexes.has("idx_wait_predictions_source_evaluated_at")) {
      await queryInterface.addIndex("wait_predictions", ["prediction_source", "evaluated_at"], {
        name: "idx_wait_predictions_source_evaluated_at",
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map(normalizeTableName).filter(Boolean));

    if (!tableSet.has("wait_predictions")) {
      return;
    }

    const columns = await getColumnSet(queryInterface, "wait_predictions");

    try {
      await queryInterface.removeIndex("wait_predictions", "idx_wait_predictions_source_evaluated_at");
    } catch {
      // Ignore missing index on partially applied databases.
    }

    if (columns.has("evaluated_at")) {
      await queryInterface.removeColumn("wait_predictions", "evaluated_at");
    }

    if (columns.has("absolute_error_minutes")) {
      await queryInterface.removeColumn("wait_predictions", "absolute_error_minutes");
    }

    if (columns.has("actual_wait_minutes")) {
      await queryInterface.removeColumn("wait_predictions", "actual_wait_minutes");
    }

    if (columns.has("feature_snapshot")) {
      await queryInterface.removeColumn("wait_predictions", "feature_snapshot");
    }

    if (columns.has("rule_wait_minutes")) {
      await queryInterface.removeColumn("wait_predictions", "rule_wait_minutes");
    }
  },
};
