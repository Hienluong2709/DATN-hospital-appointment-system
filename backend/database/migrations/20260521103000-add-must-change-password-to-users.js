"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("users");
    if (table.must_change_password) {
      return;
    }

    await queryInterface.addColumn("users", "must_change_password", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: "status",
    });
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("users");
    if (!table.must_change_password) {
      return;
    }

    await queryInterface.removeColumn("users", "must_change_password");
  },
};
