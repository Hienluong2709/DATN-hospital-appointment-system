import { Op } from "sequelize";
import db from "../models/index.js";

const {
  Queue,
  Appointment,
  User,
  Doctor,
  Specialty,
  Room,
  Template,
  SmsLog,
} = db;

const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";
const QUEUE_SOON_THRESHOLD_MINUTES =
  Number(process.env.QUEUE_SOON_THRESHOLD_MINUTES) || 15;

const SMS_EVENT_CODES = {
  CHECKIN_ESTIMATE: "CHECKIN_ESTIMATE",
  QUEUE_SOON: "QUEUE_SOON",
  QUEUE_READY: "QUEUE_READY",
};

const SMS_TEMPLATE_FALLBACKS = {
  [SMS_EVENT_CODES.CHECKIN_ESTIMATE]:
    "Ban da check-in. Du kien vao kham luc {{predicted_start_time}} tai {{room_display}}.",
  [SMS_EVENT_CODES.QUEUE_SOON]:
    "Du kien con {{predicted_wait_minutes}} phut den luot kham. Vui long o gan {{room_display}}.",
  [SMS_EVENT_CODES.QUEUE_READY]:
    "Da den luot kham. Vui long vao {{room_display}}.",
};

const parseUtcOffsetToMinutes = (offsetValue) => {
  const matched = /^([+-])(\d{2}):(\d{2})$/.exec(offsetValue);
  if (!matched) {
    throw new Error("BUSINESS_TIMEZONE_OFFSET không hợp lệ, định dạng yêu cầu +/-HH:mm");
  }

  const sign = matched[1] === "+" ? 1 : -1;
  const hours = Number(matched[2]);
  const minutes = Number(matched[3]);
  return sign * (hours * 60 + minutes);
};

const BUSINESS_TIMEZONE_OFFSET_MINUTES = parseUtcOffsetToMinutes(BUSINESS_TIMEZONE_OFFSET);

const getBusinessShiftedDate = (dateValue) =>
  new Date(new Date(dateValue).getTime() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);

const formatBusinessDateTime = (dateValue) => {
  if (!dateValue) {
    return "";
  }

  const shifted = getBusinessShiftedDate(dateValue);
  if (Number.isNaN(shifted.getTime())) {
    return "";
  }

  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const year = shifted.getUTCFullYear();
  return `${hours}:${minutes} ${day}/${month}/${year}`;
};

const renderTemplate = (templateContent, variables) => {
  return String(templateContent || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return variables[key] ?? "";
  });
};

const buildRoomDisplay = (room) => {
  if (!room?.name) {
    return "phong kham";
  }

  return room.floor ? `${room.name} - Tầng ${room.floor}` : room.name;
};

const getQueueNotificationInclude = () => [
  {
    model: Appointment,
    attributes: ["id", "date", "status"],
    include: [
      {
        model: User,
        as: "patient",
        attributes: ["id", "fullname", "phone"],
      },
      {
        model: Doctor,
        attributes: ["id"],
        include: [
          {
            model: User,
            attributes: ["id", "fullname"],
          },
          {
            model: Specialty,
            attributes: ["id", "name"],
          },
          {
            model: Room,
            attributes: ["id", "name", "floor"],
          },
        ],
      },
    ],
  },
];

const loadQueueForNotification = async (queueId, transaction) => {
  return Queue.findByPk(queueId, {
    include: getQueueNotificationInclude(),
    transaction,
  });
};

const resolveTemplateDefinition = async (eventCode, transaction) => {
  const template = await Template.findOne({
    where: {
      code: eventCode,
      type: "SMS",
    },
    transaction,
  });

  if (template && template.is_active === false) {
    return {
      eventCode,
      skip: true,
      skipReason: "template_inactive",
    };
  }

  return {
    eventCode,
    templateCode: template?.code || eventCode,
    content: template?.content || SMS_TEMPLATE_FALLBACKS[eventCode] || "",
    skip: false,
  };
};

const buildNotificationVariables = (queue) => {
  const patient = queue?.Appointment?.patient;
  const doctorUser = queue?.Appointment?.Doctor?.User;
  const specialty = queue?.Appointment?.Doctor?.Specialty;
  const room = queue?.Appointment?.Doctor?.Room;
  const predictedWaitMinutes = Number(queue?.predicted_wait_minutes ?? 0);

  return {
    patient_name: patient?.fullname || "",
    doctor_name: doctorUser?.fullname || "",
    specialty_name: specialty?.name || "",
    room_display: buildRoomDisplay(room),
    predicted_wait_minutes: String(Math.max(0, predictedWaitMinutes)),
    predicted_start_time: formatBusinessDateTime(queue?.estimated_start),
    checked_in_time: formatBusinessDateTime(queue?.checked_in_at),
    appointment_date: String(queue?.date || queue?.Appointment?.date || ""),
  };
};

const createSmsLogIfNotExists = async ({
  queue,
  eventCode,
  scheduledAt,
  transaction,
  dryRun = false,
}) => {
  const patient = queue?.Appointment?.patient;
  const phone = String(patient?.phone || "").trim();

  if (!phone) {
    return {
      created: false,
      skippedReason: "missing_phone",
    };
  }

  const existing = await SmsLog.findOne({
    where: {
      queue_id: queue.id,
      event_code: eventCode,
    },
    transaction,
  });

  if (existing) {
    return {
      created: false,
      skippedReason: "duplicate",
    };
  }

  const templateDefinition = await resolveTemplateDefinition(eventCode, transaction);
  if (templateDefinition.skip) {
    return {
      created: false,
      skippedReason: templateDefinition.skipReason,
    };
  }

  const content = renderTemplate(
    templateDefinition.content,
    buildNotificationVariables(queue)
  );

  if (dryRun) {
    return {
      created: false,
      skippedReason: "dry_run",
      preview: {
        phone,
        eventCode,
        content,
      },
    };
  }

  await SmsLog.create(
    {
      appointment_id: queue.appointment_id,
      queue_id: queue.id,
      phone,
      template_code: templateDefinition.templateCode,
      event_code: eventCode,
      content,
      scheduled_at: scheduledAt || new Date(),
      status: "Pending",
      provider_message_id: null,
      error_message: null,
    },
    { transaction }
  );

  return {
    created: true,
  };
};

export const enqueueCheckInEstimateNotificationForQueue = async (
  queueId,
  options = {}
) => {
  const queue = await loadQueueForNotification(queueId, options.transaction);
  if (!queue) {
    return {
      queue_id: queueId,
      created: false,
      skippedReason: "queue_not_found",
    };
  }

  return createSmsLogIfNotExists({
    queue,
    eventCode: SMS_EVENT_CODES.CHECKIN_ESTIMATE,
    scheduledAt: new Date(),
    transaction: options.transaction,
    dryRun: Boolean(options.dryRun),
  });
};

export const dispatchQueueNotificationEventsForDateService = async (
  targetDate,
  options = {}
) => {
  const dryRun = Boolean(options.dryRun);
  const transaction = options.transaction;

  const queues = await Queue.findAll({
    where: {
      date: targetDate,
      checked_in_at: {
        [Op.ne]: null,
      },
      actual_end: null,
    },
    include: getQueueNotificationInclude(),
    order: [
      ["doctor_id", "ASC"],
      ["checked_in_at", "ASC"],
      ["id", "ASC"],
    ],
    transaction,
  });

  const summary = {
    date: targetDate,
    dry_run: dryRun,
    total_candidates: queues.length,
    queue_soon_created: 0,
    queue_ready_created: 0,
    duplicates: 0,
    missing_phone: 0,
    template_inactive: 0,
    skipped_not_due: 0,
    skipped_not_checked_in: 0,
    skipped_not_waiting: 0,
  };

  for (const queue of queues) {
    if (queue?.Appointment?.status !== "CheckedIn") {
      summary.skipped_not_waiting += 1;
      continue;
    }

    if (!queue.checked_in_at) {
      summary.skipped_not_checked_in += 1;
      continue;
    }

    if (queue.actual_start) {
      summary.skipped_not_waiting += 1;
      continue;
    }

    const predictedWaitMinutes = Number(queue.predicted_wait_minutes ?? 0);
    let eventCode = null;

    if (predictedWaitMinutes <= 0) {
      eventCode = SMS_EVENT_CODES.QUEUE_READY;
    } else if (predictedWaitMinutes <= QUEUE_SOON_THRESHOLD_MINUTES) {
      eventCode = SMS_EVENT_CODES.QUEUE_SOON;
    } else {
      summary.skipped_not_due += 1;
      continue;
    }

    const result = await createSmsLogIfNotExists({
      queue,
      eventCode,
      scheduledAt: new Date(),
      transaction,
      dryRun,
    });

    if (result.created) {
      if (eventCode === SMS_EVENT_CODES.QUEUE_READY) {
        summary.queue_ready_created += 1;
      } else {
        summary.queue_soon_created += 1;
      }
      continue;
    }

    if (result.skippedReason === "duplicate") {
      summary.duplicates += 1;
    } else if (result.skippedReason === "missing_phone") {
      summary.missing_phone += 1;
    } else if (result.skippedReason === "template_inactive") {
      summary.template_inactive += 1;
    }
  }

  return summary;
};

export { SMS_EVENT_CODES, QUEUE_SOON_THRESHOLD_MINUTES };
