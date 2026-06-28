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
const QUEUE_ESTIMATE_UPDATE_THRESHOLD_MINUTES =
  Number(process.env.QUEUE_ESTIMATE_UPDATE_THRESHOLD_MINUTES) || 5;
const APPOINTMENT_REMINDER_BEFORE_MINUTES =
  Number(process.env.APPOINTMENT_REMINDER_BEFORE_MINUTES) || 60;

const SMS_EVENT_CODES = {
  APPOINTMENT_REMINDER_1H: "APPOINTMENT_REMINDER_1H",
  CHECKIN_ESTIMATE: "CHECKIN_ESTIMATE",
  QUEUE_ESTIMATE_UPDATED: "QUEUE_ESTIMATE_UPDATED",
  QUEUE_SOON: "QUEUE_SOON",
  QUEUE_READY: "QUEUE_READY",
};

const SMS_TEMPLATE_FALLBACKS = {
  [SMS_EVENT_CODES.APPOINTMENT_REMINDER_1H]:
    "Bạn có lịch khám lúc {{appointment_time}} với bác sĩ {{doctor_name}} tại {{room_display}}. Vui lòng đến đúng giờ để check-in.",
  [SMS_EVENT_CODES.CHECKIN_ESTIMATE]:
    "Bạn đã check-in. Dự kiến vào khám lúc {{predicted_start_time}} tại {{room_display}}.",
  [SMS_EVENT_CODES.QUEUE_ESTIMATE_UPDATED]:
    "Giờ khám dự kiến của bạn được cập nhật thành {{predicted_start_time}} tại {{room_display}}.",
  [SMS_EVENT_CODES.QUEUE_SOON]:
    "Dự kiến còn {{predicted_wait_minutes}} phút đến giờ khám. Vui lòng ở gần {{room_display}}.",
  [SMS_EVENT_CODES.QUEUE_READY]:
    "Đã đến lượt khám. Vui lòng vào {{room_display}}.",
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

const parseDateParts = (dateValue) => {
  const [year, month, day] = String(dateValue).slice(0, 10).split("-").map(Number);
  return { year, month, day };
};

const parseDateTimeAtBusinessOffset = (dateValue, timeValue) => {
  if (!dateValue || !timeValue) {
    return null;
  }

  const { year, month, day } = parseDateParts(dateValue);
  const [hour, minute, second] = String(timeValue).slice(0, 8).split(":").map(Number);
  const utcTimestamp =
    Date.UTC(year, month - 1, day, hour, minute, second || 0) -
    BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
  const parsed = new Date(utcTimestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getBusinessDateString = (dateValue = new Date()) => {
  const shifted = getBusinessShiftedDate(dateValue);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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

const parseDate = (dateValue) => {
  if (!dateValue) {
    return null;
  }

  const parsed = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const diffMinutes = (leftValue, rightValue) => {
  const left = parseDate(leftValue);
  const right = parseDate(rightValue);
  if (!left || !right) {
    return null;
  }

  return Math.round((right.getTime() - left.getTime()) / (60 * 1000));
};

const computeRemainingWaitMinutes = (queue, now = new Date()) => {
  const estimatedStart = parseDate(queue?.estimated_start);
  if (!estimatedStart) {
    return null;
  }

  return Math.max(0, Math.ceil((estimatedStart.getTime() - now.getTime()) / (60 * 1000)));
};

const buildEstimateUpdatedEventCode = (estimatedStart) => {
  const parsed = parseDate(estimatedStart);
  if (!parsed) {
    return SMS_EVENT_CODES.QUEUE_ESTIMATE_UPDATED;
  }

  return `${SMS_EVENT_CODES.QUEUE_ESTIMATE_UPDATED}:${parsed.toISOString().slice(0, 16)}`;
};

const parseNotifiedEstimateFromContent = (content) => {
  const matched = /(?:luc|lúc)\s+(\d{2}):(\d{2})\s+(\d{2})\/(\d{2})\/(\d{4})/i.exec(
    String(content || ""),
  );
  if (!matched) {
    return null;
  }

  const [, hour, minute, day, month, year] = matched;
  const timestamp =
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0) -
    BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toIsoString = (dateValue) => {
  const parsed = parseDate(dateValue);
  return parsed ? parsed.toISOString() : null;
};

const getNotifiedEstimateFromSmsLog = (smsLog) => {
  const metadataEstimate = parseDate(smsLog?.metadata?.notified_estimated_start);
  if (metadataEstimate) {
    return metadataEstimate;
  }

  return parseNotifiedEstimateFromContent(smsLog?.content);
};

const renderTemplate = (templateContent, variables) => {
  return String(templateContent || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return variables[key] ?? "";
  });
};

const buildRoomDisplay = (room) => {
  if (!room?.name) {
    return "phòng khám";
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

const getAppointmentReminderInclude = () => [
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
  {
    model: Queue,
    attributes: ["id"],
    required: false,
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

const buildNotificationVariablesWithOverrides = (queue, overrides = {}) => ({
  ...buildNotificationVariables(queue),
  ...Object.fromEntries(
    Object.entries(overrides).map(([key, value]) => [key, String(value ?? "")]),
  ),
});

const buildAppointmentReminderVariables = (appointment) => {
  const patient = appointment?.patient;
  const doctorUser = appointment?.Doctor?.User;
  const specialty = appointment?.Doctor?.Specialty;
  const room = appointment?.Doctor?.Room;
  const appointmentDateTime = parseDateTimeAtBusinessOffset(
    appointment?.date,
    appointment?.time_slot,
  );

  return {
    patient_name: patient?.fullname || "",
    doctor_name: doctorUser?.fullname || "",
    specialty_name: specialty?.name || "",
    room_display: buildRoomDisplay(room),
    appointment_date: String(appointment?.date || ""),
    appointment_time: formatBusinessDateTime(appointmentDateTime),
  };
};

const createSmsLogIfNotExists = async ({
  queue,
  eventCode,
  templateEventCode,
  scheduledAt,
  transaction,
  dryRun = false,
  variables = {},
  metadata = {},
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

  const templateDefinition = await resolveTemplateDefinition(
    templateEventCode || eventCode,
    transaction,
  );
  if (templateDefinition.skip) {
    return {
      created: false,
      skippedReason: templateDefinition.skipReason,
    };
  }

  const content = renderTemplate(
    templateDefinition.content,
    buildNotificationVariablesWithOverrides(queue, variables)
  );

  if (dryRun) {
    return {
      created: false,
      wouldCreate: true,
      skippedReason: "dry_run",
      preview: {
        phone,
        eventCode,
        content,
        metadata,
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
      metadata,
    },
    { transaction }
  );

  return {
    created: true,
  };
};

const isCreatedOrDryRunPreview = (result) => Boolean(result?.created || result?.wouldCreate);

const findLatestEstimateNotificationForQueue = async (queueId, transaction) => {
  return SmsLog.findOne({
    where: {
      queue_id: queueId,
      event_code: {
        [Op.or]: [
          SMS_EVENT_CODES.CHECKIN_ESTIMATE,
          { [Op.like]: `${SMS_EVENT_CODES.QUEUE_ESTIMATE_UPDATED}%` },
        ],
      },
    },
    order: [["scheduled_at", "DESC"], ["id", "DESC"]],
    transaction,
  });
};

const createEstimateUpdatedSmsLogIfSignificant = async ({
  queue,
  now,
  transaction,
  dryRun = false,
}) => {
  const estimatedStart = parseDate(queue?.estimated_start);
  if (!estimatedStart) {
    return {
      created: false,
      skippedReason: "missing_estimated_start",
    };
  }

  const latestNotification = await findLatestEstimateNotificationForQueue(queue.id, transaction);
  const latestNotifiedEstimate = getNotifiedEstimateFromSmsLog(latestNotification);
  if (!latestNotifiedEstimate) {
    return {
      created: false,
      skippedReason: "missing_previous_estimate_notification",
    };
  }

  const estimateDriftMinutes = Math.abs(diffMinutes(latestNotifiedEstimate, estimatedStart) ?? 0);
  if (estimateDriftMinutes < QUEUE_ESTIMATE_UPDATE_THRESHOLD_MINUTES) {
    return {
      created: false,
      skippedReason: "estimate_change_not_significant",
    };
  }

  return createSmsLogIfNotExists({
    queue,
    eventCode: buildEstimateUpdatedEventCode(estimatedStart),
    templateEventCode: SMS_EVENT_CODES.QUEUE_ESTIMATE_UPDATED,
    scheduledAt: now,
    transaction,
    dryRun,
    variables: {
      estimate_change_minutes: estimateDriftMinutes,
    },
    metadata: {
      notification_kind: SMS_EVENT_CODES.QUEUE_ESTIMATE_UPDATED,
      notified_estimated_start: toIsoString(estimatedStart),
      previous_notified_estimated_start: toIsoString(latestNotifiedEstimate),
      estimate_change_minutes: estimateDriftMinutes,
      remaining_wait_minutes: computeRemainingWaitMinutes(queue, now),
      threshold_minutes: QUEUE_ESTIMATE_UPDATE_THRESHOLD_MINUTES,
    },
  });
};

const createAppointmentReminderSmsLogIfNotExists = async ({
  appointment,
  eventCode,
  scheduledAt,
  transaction,
  dryRun = false,
}) => {
  const patient = appointment?.patient;
  const phone = String(patient?.phone || "").trim();

  if (!phone) {
    return {
      created: false,
      skippedReason: "missing_phone",
    };
  }

  const existing = await SmsLog.findOne({
    where: {
      appointment_id: appointment.id,
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
    buildAppointmentReminderVariables(appointment),
  );

  if (dryRun) {
    return {
      created: false,
      wouldCreate: true,
      skippedReason: "dry_run",
      preview: {
        phone,
        eventCode,
        content,
        metadata: {
          notification_kind: eventCode,
          appointment_datetime: toIsoString(
            parseDateTimeAtBusinessOffset(appointment?.date, appointment?.time_slot),
          ),
        },
      },
    };
  }

  await SmsLog.create(
    {
      appointment_id: appointment.id,
      queue_id: null,
      phone,
      template_code: templateDefinition.templateCode,
      event_code: eventCode,
      content,
      scheduled_at: scheduledAt || new Date(),
      status: "Pending",
      provider_message_id: null,
      error_message: null,
      metadata: {
        notification_kind: eventCode,
        appointment_datetime: toIsoString(
          parseDateTimeAtBusinessOffset(appointment?.date, appointment?.time_slot),
        ),
      },
    },
    { transaction },
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
    metadata: {
      notification_kind: SMS_EVENT_CODES.CHECKIN_ESTIMATE,
      notified_estimated_start: toIsoString(queue.estimated_start),
      predicted_wait_minutes: queue.predicted_wait_minutes ?? null,
      remaining_wait_minutes: computeRemainingWaitMinutes(queue),
    },
  });
};

export const dispatchQueueNotificationEventsForDateService = async (
  targetDate,
  options = {}
) => {
  const dryRun = Boolean(options.dryRun);
  const transaction = options.transaction;
  const now = options.now instanceof Date ? options.now : new Date();

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
    estimate_update_created: 0,
    queue_soon_created: 0,
    queue_ready_created: 0,
    duplicates: 0,
    missing_phone: 0,
    template_inactive: 0,
    skipped_not_due: 0,
    skipped_not_checked_in: 0,
    skipped_not_waiting: 0,
    skipped_missing_estimated_start: 0,
    skipped_estimate_change_not_significant: 0,
    skipped_missing_previous_estimate_notification: 0,
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

    const remainingWaitMinutes = computeRemainingWaitMinutes(queue, now);
    if (remainingWaitMinutes === null) {
      summary.skipped_missing_estimated_start += 1;
      continue;
    }

    let eventCode = null;

    if (remainingWaitMinutes <= 0) {
      eventCode = SMS_EVENT_CODES.QUEUE_READY;
    } else if (remainingWaitMinutes <= QUEUE_SOON_THRESHOLD_MINUTES) {
      eventCode = SMS_EVENT_CODES.QUEUE_SOON;
    } else {
      const estimateUpdateResult = await createEstimateUpdatedSmsLogIfSignificant({
        queue,
        now,
        transaction,
        dryRun,
      });

      if (isCreatedOrDryRunPreview(estimateUpdateResult)) {
        summary.estimate_update_created += 1;
      } else if (estimateUpdateResult.skippedReason === "duplicate") {
        summary.duplicates += 1;
      } else if (estimateUpdateResult.skippedReason === "missing_phone") {
        summary.missing_phone += 1;
      } else if (estimateUpdateResult.skippedReason === "template_inactive") {
        summary.template_inactive += 1;
      } else if (estimateUpdateResult.skippedReason === "estimate_change_not_significant") {
        summary.skipped_estimate_change_not_significant += 1;
      } else if (estimateUpdateResult.skippedReason === "missing_previous_estimate_notification") {
        summary.skipped_missing_previous_estimate_notification += 1;
      }

      if (!isCreatedOrDryRunPreview(estimateUpdateResult)) {
        summary.skipped_not_due += 1;
      }
      continue;
    }

    const result = await createSmsLogIfNotExists({
      queue,
      eventCode,
      scheduledAt: now,
      transaction,
      dryRun,
      variables: {
        predicted_wait_minutes: remainingWaitMinutes,
      },
      metadata: {
        notification_kind: eventCode,
        notified_estimated_start: toIsoString(queue.estimated_start),
        predicted_wait_minutes: queue.predicted_wait_minutes ?? null,
        remaining_wait_minutes: remainingWaitMinutes,
      },
    });

    if (isCreatedOrDryRunPreview(result)) {
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

export const dispatchAppointmentReminderEventsForDateService = async (
  targetDate = getBusinessDateString(),
  options = {},
) => {
  const dryRun = Boolean(options.dryRun);
  const transaction = options.transaction;
  const now = options.now instanceof Date ? options.now : new Date();
  const reminderBeforeMinutes =
    Number(options.reminderBeforeMinutes) || APPOINTMENT_REMINDER_BEFORE_MINUTES;

  const appointments = await Appointment.findAll({
    where: {
      date: targetDate,
      status: "Confirmed",
      time_slot: {
        [Op.ne]: null,
      },
    },
    include: getAppointmentReminderInclude(),
    order: [
      ["date", "ASC"],
      ["time_slot", "ASC"],
      ["id", "ASC"],
    ],
    transaction,
  });

  const summary = {
    date: targetDate,
    dry_run: dryRun,
    total_candidates: appointments.length,
    reminder_created: 0,
    duplicates: 0,
    missing_phone: 0,
    template_inactive: 0,
    skipped_not_due: 0,
    skipped_checked_in: 0,
    skipped_invalid_time: 0,
  };

  for (const appointment of appointments) {
    if (appointment.Queue) {
      summary.skipped_checked_in += 1;
      continue;
    }

    const appointmentDateTime = parseDateTimeAtBusinessOffset(
      appointment.date,
      appointment.time_slot,
    );

    if (!appointmentDateTime) {
      summary.skipped_invalid_time += 1;
      continue;
    }

    const minutesUntilAppointment =
      (appointmentDateTime.getTime() - now.getTime()) / (60 * 1000);

    if (minutesUntilAppointment < 0 || minutesUntilAppointment > reminderBeforeMinutes) {
      summary.skipped_not_due += 1;
      continue;
    }

    const result = await createAppointmentReminderSmsLogIfNotExists({
      appointment,
      eventCode: SMS_EVENT_CODES.APPOINTMENT_REMINDER_1H,
      scheduledAt: now,
      transaction,
      dryRun,
    });

    if (isCreatedOrDryRunPreview(result)) {
      summary.reminder_created += 1;
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

export {
  APPOINTMENT_REMINDER_BEFORE_MINUTES,
  QUEUE_SOON_THRESHOLD_MINUTES,
  SMS_EVENT_CODES,
};
