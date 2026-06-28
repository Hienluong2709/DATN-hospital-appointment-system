import db from "../models/index.js";

const { QueueActionLog } = db;

export const createQueueActionLog = async ({
  queueId = null,
  appointmentId,
  actor = null,
  action,
  fromStatus = null,
  toStatus = null,
  note = null,
  metadata = null,
}, transaction = null) => {
  if (!QueueActionLog || !appointmentId || !action) {
    return null;
  }

  return QueueActionLog.create(
    {
      queue_id: queueId,
      appointment_id: appointmentId,
      actor_user_id: actor?.id ?? null,
      actor_role: actor?.role ?? null,
      action,
      from_status: fromStatus,
      to_status: toStatus,
      note,
      metadata,
    },
    { transaction },
  );
};
