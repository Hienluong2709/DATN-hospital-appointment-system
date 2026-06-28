"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("queues", "checked_in_at", {
      type: Sequelize.DATE,
      allowNull: true,
      after: "queue_number",
    });

    await queryInterface.addColumn("queues", "predicted_wait_minutes", {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: "estimated_start",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("queues", "predicted_wait_minutes");
    await queryInterface.removeColumn("queues", "checked_in_at");
  },
};
