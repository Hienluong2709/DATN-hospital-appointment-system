"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkUpdate(
        "appointments",
        {
          status: "Confirmed",
          hold_expires_at: null,
        },
        {
          status: "Pending",
        },
        { transaction },
      );

      await queryInterface.bulkUpdate(
        "appointments",
        {
          hold_expires_at: null,
        },
        {
          status: {
            [Sequelize.Op.in]: ["Confirmed", "CheckedIn", "Cancelled", "Completed", "NoShow"],
          },
        },
        { transaction },
      );
    });
  },

  async down() {
    // One-way data normalization: old Pending appointments cannot be restored safely.
  },
};
