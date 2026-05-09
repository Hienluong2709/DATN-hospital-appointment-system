"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("work_schedule_blocks", "requested_by_user_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addColumn("work_schedule_blocks", "reviewed_by_user_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addColumn("work_schedule_blocks", "status", {
      type: Sequelize.ENUM("Pending", "Approved", "Rejected"),
      allowNull: false,
      defaultValue: "Approved",
    });

    await queryInterface.addColumn("work_schedule_blocks", "reviewed_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("work_schedule_blocks", "review_note", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    await queryInterface.addIndex("work_schedule_blocks", ["doctor_id", "status"], {
      name: "idx_wsb_doctor_status",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("work_schedule_blocks", "idx_wsb_doctor_status");
    await queryInterface.removeColumn("work_schedule_blocks", "review_note");
    await queryInterface.removeColumn("work_schedule_blocks", "reviewed_at");
    await queryInterface.removeColumn("work_schedule_blocks", "status");
    await queryInterface.removeColumn("work_schedule_blocks", "reviewed_by_user_id");
    await queryInterface.removeColumn("work_schedule_blocks", "requested_by_user_id");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_work_schedule_blocks_status";');
  },
};
