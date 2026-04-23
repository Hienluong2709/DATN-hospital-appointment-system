export default (db) => {
  const {
    User,
    Doctor,
    Specialty,
    WorkSchedule,
    WorkScheduleBlock,
    Appointment,
    Queue,
    WaitPrediction,
    Room,
    Template,
    SmsLog,
    JobExecutionLog,
  } = db;

  User.hasOne(Doctor, { foreignKey: "user_id" });
  Doctor.belongsTo(User, { foreignKey: "user_id" });

  Specialty.hasMany(Doctor, { foreignKey: "specialty_id" });
  Doctor.belongsTo(Specialty, { foreignKey: "specialty_id" });

  Specialty.hasMany(Room, { foreignKey: "specialty_id" });
  Room.belongsTo(Specialty, { foreignKey: "specialty_id" });

  Room.hasMany(Doctor, { foreignKey: "room_id" });
  Doctor.belongsTo(Room, { foreignKey: "room_id" });

  Doctor.hasMany(WorkSchedule, { foreignKey: "doctor_id" });
  WorkSchedule.belongsTo(Doctor, { foreignKey: "doctor_id" });

  Doctor.hasMany(WorkScheduleBlock, { foreignKey: "doctor_id" });
  WorkScheduleBlock.belongsTo(Doctor, { foreignKey: "doctor_id" });

  User.hasMany(Appointment, {
    foreignKey: "patient_id",
    as: "appointments",
  });
  Appointment.belongsTo(User, {
    foreignKey: "patient_id",
    as: "patient",
  });

  Doctor.hasMany(Appointment, { foreignKey: "doctor_id" });
  Appointment.belongsTo(Doctor, { foreignKey: "doctor_id" });

  Appointment.hasOne(Queue, { foreignKey: "appointment_id" });
  Queue.belongsTo(Appointment, { foreignKey: "appointment_id" });

  Queue.hasMany(WaitPrediction, { foreignKey: "queue_id", as: "predictions" });
  WaitPrediction.belongsTo(Queue, { foreignKey: "queue_id" });
  Queue.belongsTo(WaitPrediction, { foreignKey: "latest_prediction_id", targetKey: "id", as: "WaitPrediction" });

  Template.hasMany(SmsLog, {
    foreignKey: "template_code",
    sourceKey: "code",
    as: "smsLogs",
  });
  SmsLog.belongsTo(Template, {
    foreignKey: "template_code",
    targetKey: "code",
    as: "template",
  });

  Appointment.hasMany(SmsLog, {
    foreignKey: "appointment_id",
    as: "smsLogs",
  });
  SmsLog.belongsTo(Appointment, {
    foreignKey: "appointment_id",
    as: "appointment",
  });

  Queue.hasMany(SmsLog, {
    foreignKey: "queue_id",
    as: "smsLogs",
  });
  SmsLog.belongsTo(Queue, {
    foreignKey: "queue_id",
    as: "queue",
  });

  if (JobExecutionLog) {
    // Standalone job log table, no associations required for now.
  }
};
