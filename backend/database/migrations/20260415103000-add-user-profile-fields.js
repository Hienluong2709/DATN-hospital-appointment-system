"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "date_of_birth", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });

    await queryInterface.addColumn("users", "gender", {
      type: Sequelize.ENUM("MALE", "FEMALE", "OTHER"),
      allowNull: true,
    });

    await queryInterface.addColumn("users", "address", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("users", "address");
    await queryInterface.removeColumn("users", "gender");
    await queryInterface.removeColumn("users", "date_of_birth");
  },
};
