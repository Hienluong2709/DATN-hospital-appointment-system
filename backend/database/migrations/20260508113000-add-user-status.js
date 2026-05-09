"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "status", {
      type: Sequelize.ENUM("Active", "Inactive"),
      allowNull: false,
      defaultValue: "Active",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("users", "status");
  },
};
