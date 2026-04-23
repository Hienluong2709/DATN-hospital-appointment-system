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

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await getTableSet(queryInterface);

    if (!tables.has("users")) {
      await queryInterface.createTable("users", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        username: { type: Sequelize.STRING(50), allowNull: false, unique: true },
        password: { type: Sequelize.STRING(255), allowNull: false },
        fullname: { type: Sequelize.STRING(100), allowNull: false },
        email: { type: Sequelize.STRING(100), allowNull: true },
        phone: { type: Sequelize.STRING(15), allowNull: true },
        role: {
          type: Sequelize.ENUM("ADMIN", "DOCTOR", "PATIENT", "RECEPTIONIST"),
          allowNull: false,
          defaultValue: "PATIENT",
        },
      });
      tables.add("users");
    }

    if (!tables.has("specialties")) {
      await queryInterface.createTable("specialties", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        name: { type: Sequelize.STRING(100), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
      });
      tables.add("specialties");
    }

    if (!tables.has("rooms")) {
      await queryInterface.createTable("rooms", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        name: { type: Sequelize.STRING(50), allowNull: false, unique: true },
        floor: { type: Sequelize.INTEGER, allowNull: true },
        specialty_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "specialties", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        status: { type: Sequelize.ENUM("Available", "Maintenance"), defaultValue: "Available" },
        description: { type: Sequelize.TEXT, allowNull: true },
      });
      tables.add("rooms");
    }

    if (!tables.has("doctors")) {
      await queryInterface.createTable("doctors", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        specialty_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "specialties", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        room_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "rooms", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        description: { type: Sequelize.TEXT, allowNull: true },
        status: { type: Sequelize.ENUM("Active", "Inactive"), defaultValue: "Active" },
      });
      tables.add("doctors");
    }

    if (!tables.has("work_schedules")) {
      await queryInterface.createTable("work_schedules", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        doctor_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "doctors", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        day_of_week: { type: Sequelize.INTEGER, allowNull: false },
        start_time: { type: Sequelize.TIME, allowNull: true },
        end_time: { type: Sequelize.TIME, allowNull: true },
      });
      tables.add("work_schedules");
    }

    if (!tables.has("appointments")) {
      await queryInterface.createTable("appointments", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        patient_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        doctor_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "doctors", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        date: { type: Sequelize.DATEONLY, allowNull: false },
        reason: { type: Sequelize.TEXT, allowNull: true },
        time_slot: { type: Sequelize.TIME, allowNull: true },
        status: { type: Sequelize.ENUM("Pending", "Confirmed", "Cancelled"), defaultValue: "Pending" },
        created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      });
      tables.add("appointments");
    }

    if (!tables.has("queues")) {
      await queryInterface.createTable("queues", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        appointment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "appointments", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        queue_number: { type: Sequelize.INTEGER, allowNull: true },
        actual_start: { type: Sequelize.DATE, allowNull: true },
        actual_end: { type: Sequelize.DATE, allowNull: true },
        estimated_start: { type: Sequelize.DATE, allowNull: true },
      });
      tables.add("queues");
    }

    if (!tables.has("wait_predictions")) {
      await queryInterface.createTable("wait_predictions", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        queue_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "queues", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        predicted_wait_time: { type: Sequelize.INTEGER, allowNull: true },
        created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      });
      tables.add("wait_predictions");
    }

    if (!tables.has("templates")) {
      await queryInterface.createTable("templates", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        code: { type: Sequelize.STRING(50), allowNull: false, unique: true },
        content: { type: Sequelize.TEXT, allowNull: true },
        type: { type: Sequelize.ENUM("SMS", "EMAIL"), allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
        description: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      });
      tables.add("templates");
    }

    if (!tables.has("sms_logs")) {
      await queryInterface.createTable("sms_logs", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        phone: { type: Sequelize.STRING(15), allowNull: true },
        template_code: {
          type: Sequelize.STRING(50),
          allowNull: true,
          references: { model: "templates", key: "code" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        content: { type: Sequelize.TEXT, allowNull: true },
        scheduled_at: { type: Sequelize.DATE, allowNull: true },
        sent_at: { type: Sequelize.DATE, allowNull: true },
        status: { type: Sequelize.ENUM("Pending", "Sent", "Failed"), defaultValue: "Pending" },
      });
      tables.add("sms_logs");
    }

    if (!tables.has("otp_codes")) {
      await queryInterface.createTable("otp_codes", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        code: { type: Sequelize.STRING(6), allowNull: false },
        phone: { type: Sequelize.STRING(15), allowNull: false },
        expired_time: { type: Sequelize.DATE, allowNull: true },
        status: { type: Sequelize.ENUM("Pending", "Verified", "Expired"), defaultValue: "Pending" },
      });
      tables.add("otp_codes");
    }

    if (!tables.has("equeue_numbers")) {
      await queryInterface.createTable("equeue_numbers", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        date: { type: Sequelize.DATEONLY, allowNull: false },
        current_number: { type: Sequelize.INTEGER, defaultValue: 0 },
      });
      tables.add("equeue_numbers");
    }
  },

  async down(queryInterface) {
    const tables = await getTableSet(queryInterface);
    const dropIfExists = async (tableName) => {
      if (tables.has(tableName)) {
        await queryInterface.dropTable(tableName);
      }
    };

    await dropIfExists("equeue_numbers");
    await dropIfExists("otp_codes");
    await dropIfExists("sms_logs");
    await dropIfExists("templates");
    await dropIfExists("wait_predictions");
    await dropIfExists("queues");
    await dropIfExists("appointments");
    await dropIfExists("work_schedules");
    await dropIfExists("doctors");
    await dropIfExists("rooms");
    await dropIfExists("specialties");
    await dropIfExists("users");
  },
};
