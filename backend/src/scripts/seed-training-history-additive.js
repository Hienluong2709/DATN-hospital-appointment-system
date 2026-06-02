import { Op } from "sequelize";

import db from "../models/index.js";
import initAssociations from "../models/associations.js";

const {
  sequelize,
  User,
  Doctor,
  Specialty,
  WorkSchedule,
  WorkScheduleBlock,
  Appointment,
  Queue,
  WaitPrediction,
  EQueueNumber,
} = db;

initAssociations(db);

const DEMO_REASON_PREFIX = "DEMO_TRAINING";
const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";
const SLOT_MINUTES = 30;
const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_BUFFER_DAYS = 21;
const TRAINING_PREDICTION_SOURCE = "synthetic_queue_realistic_seed";
const TRAINING_MODEL_VERSION = "synthetic_queue_realistic_v2";

const defaultSimulationProfile = {
  avgVisitMinutes: 24,
  visitSpreadMinutes: 8,
  occupancyBase: 0.54,
  noShowRate: 0.04,
  priorityRate: 0.08,
  maxEarlyStartMinutes: 8,
  maxEarlyCheckInMinutes: 35,
  maxLateCheckInMinutes: 10,
};

const specialtySimulationProfiles = {
  "Tim mạch": {
    avgVisitMinutes: 28,
    visitSpreadMinutes: 10,
    occupancyBase: 0.63,
    noShowRate: 0.03,
    priorityRate: 0.11,
    maxEarlyStartMinutes: 6,
    maxEarlyCheckInMinutes: 40,
    maxLateCheckInMinutes: 8,
  },
  "Da liễu": {
    avgVisitMinutes: 18,
    visitSpreadMinutes: 7,
    occupancyBase: 0.56,
    noShowRate: 0.06,
    priorityRate: 0.06,
    maxEarlyStartMinutes: 10,
    maxEarlyCheckInMinutes: 30,
    maxLateCheckInMinutes: 12,
  },
  "Nhi khoa": {
    avgVisitMinutes: 22,
    visitSpreadMinutes: 9,
    occupancyBase: 0.66,
    noShowRate: 0.05,
    priorityRate: 0.12,
    maxEarlyStartMinutes: 7,
    maxEarlyCheckInMinutes: 28,
    maxLateCheckInMinutes: 15,
  },
  "Nội tổng quát": {
    avgVisitMinutes: 24,
    visitSpreadMinutes: 8,
    occupancyBase: 0.6,
    noShowRate: 0.04,
    priorityRate: 0.08,
    maxEarlyStartMinutes: 8,
    maxEarlyCheckInMinutes: 36,
    maxLateCheckInMinutes: 10,
  },
  "Tai mũi họng": {
    avgVisitMinutes: 20,
    visitSpreadMinutes: 7,
    occupancyBase: 0.58,
    noShowRate: 0.05,
    priorityRate: 0.07,
    maxEarlyStartMinutes: 10,
    maxEarlyCheckInMinutes: 32,
    maxLateCheckInMinutes: 10,
  },
  "Sản phụ khoa": {
    avgVisitMinutes: 26,
    visitSpreadMinutes: 9,
    occupancyBase: 0.62,
    noShowRate: 0.04,
    priorityRate: 0.1,
    maxEarlyStartMinutes: 6,
    maxEarlyCheckInMinutes: 35,
    maxLateCheckInMinutes: 8,
  },
  "Chấn thương chỉnh hình": {
    avgVisitMinutes: 27,
    visitSpreadMinutes: 11,
    occupancyBase: 0.57,
    noShowRate: 0.03,
    priorityRate: 0.12,
    maxEarlyStartMinutes: 5,
    maxEarlyCheckInMinutes: 35,
    maxLateCheckInMinutes: 10,
  },
  "Thần kinh": {
    avgVisitMinutes: 30,
    visitSpreadMinutes: 10,
    occupancyBase: 0.53,
    noShowRate: 0.03,
    priorityRate: 0.09,
    maxEarlyStartMinutes: 5,
    maxEarlyCheckInMinutes: 42,
    maxLateCheckInMinutes: 8,
  },
  "Tiêu hóa": {
    avgVisitMinutes: 25,
    visitSpreadMinutes: 9,
    occupancyBase: 0.58,
    noShowRate: 0.04,
    priorityRate: 0.07,
    maxEarlyStartMinutes: 7,
    maxEarlyCheckInMinutes: 34,
    maxLateCheckInMinutes: 9,
  },
};

const specialtyReasonPool = {
  "Tim mạch": [
    "Đau ngực khi gắng sức",
    "Hồi hộp, tim đập nhanh",
    "Theo dõi tăng huyết áp",
    "Khó thở khi leo cầu thang",
  ],
  "Da liễu": [
    "Nổi mẩn đỏ kéo dài",
    "Ngứa da vùng cánh tay",
    "Tái khám viêm da cơ địa",
    "Mụn viêm lan rộng",
  ],
  "Nhi khoa": [
    "Ho, sổ mũi kéo dài",
    "Kiểm tra dinh dưỡng định kỳ",
    "Sốt nhẹ tái đi tái lại",
    "Đau bụng ở trẻ nhỏ",
  ],
  "Nội tổng quát": [
    "Kiểm tra sức khỏe định kỳ",
    "Tái khám đái tháo đường",
    "Mệt mỏi, chán ăn",
    "Theo dõi men gan",
  ],
  "Tai mũi họng": [
    "Đau họng kéo dài",
    "Nghẹt mũi về đêm",
    "Ù tai nhẹ",
    "Tái khám viêm xoang",
  ],
  "Sản phụ khoa": [
    "Khám phụ khoa định kỳ",
    "Tư vấn rối loạn kinh nguyệt",
    "Theo dõi thai định kỳ",
    "Đau bụng dưới",
  ],
  "Chấn thương chỉnh hình": [
    "Đau khớp gối khi vận động",
    "Tái khám bong gân cổ chân",
    "Đau vai gáy kéo dài",
    "Khó vận động khớp khuỷu",
  ],
  "Thần kinh": [
    "Đau đầu tái phát",
    "Chóng mặt khi thay đổi tư thế",
    "Mất ngủ kéo dài",
    "Tê tay chân từng cơn",
  ],
  "Tiêu hóa": [
    "Đầy bụng sau ăn",
    "Trào ngược dạ dày",
    "Đau bụng âm ỉ",
    "Rối loạn tiêu hóa",
  ],
};

const patientSeedPayloads = Array.from({ length: 30 }, (_, index) => {
  const ordinal = String(index + 1).padStart(2, "0");
  return {
    username: `patient_train_${ordinal}`,
    password: "123456",
    fullname: `Benh nhan demo ${ordinal}`,
    email: `patient.train.${ordinal}@gmail.com`,
    phone: `0918${String(index + 1).padStart(6, "0")}`,
    role: "PATIENT",
    gender: index % 2 === 0 ? "MALE" : "FEMALE",
    address: `Khu vuc demo ${ordinal}, TP.HCM`,
  };
});

const formatArgValue = (prefix) => {
  const matchedArg = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return matchedArg ? matchedArg.slice(prefix.length + 1) : null;
};

const parseUtcOffsetToMinutes = (offsetValue) => {
  const matched = /^([+-])(\d{2}):(\d{2})$/.exec(offsetValue || "");
  if (!matched) {
    throw new Error("BUSINESS_TIMEZONE_OFFSET không hợp lệ, định dạng yêu cầu +/-HH:mm");
  }

  const [, sign, hourText, minuteText] = matched;
  const hours = Number(hourText);
  const minutes = Number(minuteText);
  const totalMinutes = hours * 60 + minutes;
  return sign === "-" ? -totalMinutes : totalMinutes;
};

const BUSINESS_TIMEZONE_OFFSET_MINUTES = parseUtcOffsetToMinutes(BUSINESS_TIMEZONE_OFFSET);

const startDateArg = formatArgValue("--date-from");
const endDateArg = formatArgValue("--date-to");

const getBusinessTodayDateString = () => {
  const shifted = new Date(Date.now() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
};

const addDays = (dateValue, days) => {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const dateFrom = startDateArg || addDays(getBusinessTodayDateString(), -(DEFAULT_LOOKBACK_DAYS + DEFAULT_BUFFER_DAYS));
const dateTo = endDateArg || addDays(getBusinessTodayDateString(), -DEFAULT_BUFFER_DAYS);

const parseDateParts = (dateValue) => {
  const [year, month, day] = String(dateValue).split("-").map(Number);
  return { year, month, day };
};

const getDayOfWeekFromDate = (dateValue) => {
  const { year, month, day } = parseDateParts(dateValue);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const timeToMinutes = (timeValue) => {
  const [hourText, minuteText] = String(timeValue).slice(0, 5).split(":");
  return Number(hourText) * 60 + Number(minuteText);
};

const minutesToTime = (minutes) => {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");
  return `${hours}:${mins}:00`;
};

const buildDateTime = (dateValue, timeValue) => {
  return new Date(`${dateValue}T${String(timeValue).slice(0, 8)}${BUSINESS_TIMEZONE_OFFSET}`);
};

const hashString = (value) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const ratioFromKey = (key) => hashString(key) / 0xffffffff;
const smoothRatioFromKey = (key) =>
  (
    ratioFromKey(`${key}|a`) +
    ratioFromKey(`${key}|b`) +
    ratioFromKey(`${key}|c`)
  ) / 3;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundToNearestMinute = (value) => Math.round(value);
const minutesToMs = (minutes) => minutes * 60 * 1000;
const addMinutes = (dateValue, minutes) => new Date(dateValue.getTime() + minutesToMs(minutes));
const diffMinutes = (start, end) => Math.round((end.getTime() - start.getTime()) / 60000);
const randomBetween = (key, min, max) => min + smoothRatioFromKey(key) * (max - min);
const randomIntBetween = (key, min, max) => roundToNearestMinute(randomBetween(key, min, max));

const buildDoctorDateKey = (doctorId, dateValue) => `${doctorId}|${dateValue}`;
const getSimulationProfile = (specialtyName) =>
  specialtySimulationProfiles[specialtyName] || defaultSimulationProfile;

const enumerateDateRange = (startDate, endDate) => {
  const results = [];
  let cursor = startDate;

  while (cursor <= endDate) {
    results.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return results;
};

const allocateNextQueueNumber = (usedNumbers) => {
  let candidate = 1;
  while (usedNumbers.has(candidate)) {
    candidate += 1;
  }
  usedNumbers.add(candidate);
  return candidate;
};

const buildBlockMap = (blocks) => {
  const blockMap = new Map();

  for (const block of blocks) {
    const key = `${block.doctor_id}:${block.date}`;
    if (!blockMap.has(key)) {
      blockMap.set(key, []);
    }
    blockMap.get(key).push(block);
  }

  return blockMap;
};

const isSlotBlocked = (slotMinutes, blockEntries) => {
  if (!blockEntries?.length) {
    return false;
  }

  for (const block of blockEntries) {
    if (block.is_off) {
      return true;
    }

    const blockStart = timeToMinutes(block.start_time);
    const blockEnd = timeToMinutes(block.end_time);
    const slotEnd = slotMinutes + SLOT_MINUTES;

    if (slotMinutes < blockEnd && slotEnd > blockStart) {
      return true;
    }
  }

  return false;
};

const buildCandidateSlotsForDate = (schedules, blockEntries) => {
  const slots = [];

  for (const schedule of schedules) {
    const startMinutes = timeToMinutes(schedule.start_time);
    const endMinutes = timeToMinutes(schedule.end_time);

    for (let cursor = startMinutes; cursor + SLOT_MINUTES <= endMinutes; cursor += SLOT_MINUTES) {
      if (isSlotBlocked(cursor, blockEntries)) {
        continue;
      }

      slots.push(minutesToTime(cursor));
    }
  }

  return Array.from(new Set(slots)).sort();
};

const chooseReason = (specialtyName, key) => {
  const pool = specialtyReasonPool[specialtyName] || ["Tai kham dinh ky"];
  return pool[hashString(key) % pool.length];
};

const estimateOccupancyTarget = ({
  doctor,
  specialtyName,
  slotTime,
  dateValue,
  dailyLoadFactor,
}) => {
  const profile = getSimulationProfile(specialtyName);
  const slotMinutes = timeToMinutes(slotTime);
  const isMorningPeak = slotMinutes >= 8 * 60 && slotMinutes <= 10 * 60 + 30;
  const isAfternoonPeak = slotMinutes >= 13 * 60 && slotMinutes <= 15 * 60;
  const weekday = getDayOfWeekFromDate(dateValue);
  const weekdayBoost = weekday >= 1 && weekday <= 5 ? 0.04 : -0.06;
  const peakBoost = isMorningPeak || isAfternoonPeak ? 0.08 : -0.03;
  const doctorBias = ((hashString(`${doctor.id}|${specialtyName}|occupancy`) % 9) - 4) / 100;

  return clamp(
    profile.occupancyBase + weekdayBoost + peakBoost + doctorBias + dailyLoadFactor,
    0.18,
    0.92,
  );
};

const buildCheckInLeadMinutes = ({ slotKey, profile, queueNumber, dailyLoadFactor }) => {
  const lateChance =
    profile.noShowRate * 1.6 +
    Math.max(0, dailyLoadFactor) * 0.18 +
    (queueNumber > 6 ? 0.05 : 0);
  const isLateArrival = ratioFromKey(`${slotKey}|late-arrival`) < lateChance;

  if (isLateArrival) {
    return -randomIntBetween(
      `${slotKey}|late-checkin-minutes`,
      1,
      profile.maxLateCheckInMinutes,
    );
  }

  const earlyLead = randomBetween(
    `${slotKey}|early-checkin-minutes`,
    4,
    profile.maxEarlyCheckInMinutes,
  );
  const queueAdjustment = queueNumber > 5 ? Math.min(10, queueNumber - 4) : 0;

  return roundToNearestMinute(earlyLead + queueAdjustment);
};

const buildVisitDurationMinutes = ({
  slotKey,
  profile,
  queueNumber,
  dayPaceFactor,
  backlogMinutes,
}) => {
  const complexityMinutes = randomBetween(
    `${slotKey}|complexity`,
    -profile.visitSpreadMinutes,
    profile.visitSpreadMinutes * 1.7,
  );
  const overrunBoost =
    ratioFromKey(`${slotKey}|overrun-flag`) < 0.24
      ? randomBetween(`${slotKey}|overrun-minutes`, 6, 22)
      : 0;
  const quickCaseReduction =
    ratioFromKey(`${slotKey}|quick-case-flag`) < 0.14
      ? randomBetween(`${slotKey}|quick-case-minutes`, 4, 12)
      : 0;
  const backlogPressure = backlogMinutes > 20 ? -Math.min(6, backlogMinutes * 0.08) : 0;
  const queueFatigue = queueNumber > 7 ? Math.min(8, (queueNumber - 7) * 1.2) : 0;

  return clamp(
    roundToNearestMinute(
      (profile.avgVisitMinutes + complexityMinutes + overrunBoost - quickCaseReduction + queueFatigue) *
        dayPaceFactor +
        backlogPressure,
    ),
    10,
    75,
  );
};

const buildPriorityLevel = ({ slotKey, profile, dailyLoadFactor, slotTime }) => {
  const slotMinutes = timeToMinutes(slotTime);
  const peakHourBoost = slotMinutes >= 8 * 60 && slotMinutes <= 10 * 60 + 30 ? 0.02 : 0;
  const priorityChance = clamp(profile.priorityRate + Math.max(0, dailyLoadFactor) * 0.15 + peakHourBoost, 0.04, 0.18);
  const emergencyChance = clamp(0.008 + Math.max(0, dailyLoadFactor) * 0.025, 0.006, 0.035);
  const roll = ratioFromKey(`${slotKey}|priority-level`);

  if (roll < emergencyChance) {
    return "Emergency";
  }

  if (roll < emergencyChance + priorityChance) {
    return "Priority";
  }

  return "Normal";
};

const getPriorityStartPullForwardMinutes = (priorityLevel) => {
  if (priorityLevel === "Emergency") {
    return 18;
  }

  if (priorityLevel === "Priority") {
    return 9;
  }

  return 0;
};

const buildExpectedVisitDurationMinutes = ({ slotKey, profile, queueNumber, dayPaceFactor }) => {
  const forecastNoise = randomBetween(`${slotKey}|forecast-duration-noise`, -5, 7);
  const queueAdjustment = queueNumber > 6 ? Math.min(4, (queueNumber - 6) * 0.7) : 0;

  return clamp(
    roundToNearestMinute(profile.avgVisitMinutes * (0.95 + (dayPaceFactor - 1) * 0.45) + forecastNoise + queueAdjustment),
    10,
    55,
  );
};

const buildTurnaroundMinutes = ({ slotKey, visitDurationMinutes }) => {
  const base = randomBetween(`${slotKey}|turnaround`, 1, 6);
  const durationInfluence = visitDurationMinutes > 35 ? 2 : 0;
  return clamp(roundToNearestMinute(base + durationInfluence), 1, 8);
};

const ensureTrainingPatients = async () => {
  const patientsByUsername = new Map();
  let created = 0;

  for (const payload of patientSeedPayloads) {
    let user = await User.findOne({ where: { username: payload.username } });
    if (!user) {
      user = await User.create(payload);
      created += 1;
    }
    patientsByUsername.set(payload.username, user);
  }

  return {
    patients: Array.from(patientsByUsername.values()),
    created,
  };
};

const syncLatestPrediction = async (queue, predictedWaitMinutes, predictedStart) => {
  let prediction = null;

  if (queue.latest_prediction_id) {
    prediction = await WaitPrediction.findByPk(queue.latest_prediction_id);
  }

  if (!prediction) {
    prediction = await WaitPrediction.findOne({
      where: {
        queue_id: queue.id,
        prediction_source: TRAINING_PREDICTION_SOURCE,
      },
      order: [["id", "DESC"]],
    });
  }

  const values = {
    predicted_wait_time: predictedWaitMinutes,
    predicted_start: predictedStart,
    prediction_source: TRAINING_PREDICTION_SOURCE,
    model_version: TRAINING_MODEL_VERSION,
  };

  if (!prediction) {
    prediction = await WaitPrediction.create({
      queue_id: queue.id,
      ...values,
      created_at: queue.forecast_updated_at || queue.checked_in_at,
    });
  } else {
    await prediction.update(values);
  }

  if (queue.latest_prediction_id !== prediction.id) {
    await queue.update({ latest_prediction_id: prediction.id });
  }
};

const syncEQueueNumber = async (doctorId, dateValue, currentNumber) => {
  const [row, isCreated] = await EQueueNumber.findOrCreate({
    where: { doctor_id: doctorId, date: dateValue },
    defaults: { doctor_id: doctorId, date: dateValue, current_number: currentNumber },
  });

  if (!isCreated && row.current_number < currentNumber) {
    await row.update({ current_number: currentNumber });
  }
};

async function seedTrainingHistoryAdditive() {
  try {
    await sequelize.authenticate();

    console.log(`📚 Generating additive training history from ${dateFrom} to ${dateTo}...`);

    const patientResult = await ensureTrainingPatients();

    const doctors = await Doctor.findAll({
      where: { status: "Active" },
      include: [
        { model: User, attributes: ["id", "username", "fullname"] },
        { model: Specialty, attributes: ["id", "name"] },
      ],
      order: [["id", "ASC"]],
    });

    const doctorIds = doctors.map((doctor) => doctor.id);

    const schedules = await WorkSchedule.findAll({
      where: { doctor_id: doctorIds },
      order: [
        ["doctor_id", "ASC"],
        ["day_of_week", "ASC"],
        ["start_time", "ASC"],
      ],
    });

    const blocks = await WorkScheduleBlock.findAll({
      where: {
        doctor_id: doctorIds,
        date: {
          [Op.gte]: dateFrom,
          [Op.lte]: dateTo,
        },
      },
      order: [
        ["doctor_id", "ASC"],
        ["date", "ASC"],
        ["start_time", "ASC"],
      ],
    });

    const schedulesByDoctorAndDay = new Map();
    for (const schedule of schedules) {
      const key = `${schedule.doctor_id}:${schedule.day_of_week}`;
      if (!schedulesByDoctorAndDay.has(key)) {
        schedulesByDoctorAndDay.set(key, []);
      }
      schedulesByDoctorAndDay.get(key).push(schedule);
    }

    const blockMap = buildBlockMap(blocks);
    const generatedDates = enumerateDateRange(dateFrom, dateTo);

    const existingAppointments = await Appointment.findAll({
      where: {
        date: {
          [Op.gte]: dateFrom,
          [Op.lte]: dateTo,
        },
        reason: {
          [Op.like]: `${DEMO_REASON_PREFIX}:%`,
        },
      },
    });
    const appointmentByKey = new Map(
      existingAppointments.map((appointment) => [
        `${appointment.doctor_id}|${appointment.date}|${appointment.time_slot}|${appointment.reason}`,
        appointment,
      ]),
    );
    const occupiedAppointments = await Appointment.findAll({
      where: {
        doctor_id: doctorIds,
        date: {
          [Op.gte]: dateFrom,
          [Op.lte]: dateTo,
        },
        time_slot: {
          [Op.ne]: null,
        },
        status: {
          [Op.ne]: "Cancelled",
        },
      },
    });
    const occupiedAppointmentByDoctorDateSlot = new Map(
      occupiedAppointments.map((appointment) => [
        `${appointment.doctor_id}|${appointment.date}|${appointment.time_slot}`,
        appointment,
      ]),
    );

    const existingQueues = await Queue.findAll({
      where: {
        doctor_id: doctorIds,
        date: {
          [Op.gte]: dateFrom,
          [Op.lte]: dateTo,
        },
      },
    });
    const queueByAppointmentId = new Map(
      existingQueues.map((queue) => [queue.appointment_id, queue]),
    );
    const usedQueueNumbersByDoctorDate = new Map();
    for (const queue of existingQueues) {
      if (!queue.queue_number) {
        continue;
      }

      const key = buildDoctorDateKey(queue.doctor_id, queue.date);
      if (!usedQueueNumbersByDoctorDate.has(key)) {
        usedQueueNumbersByDoctorDate.set(key, new Set());
      }
      usedQueueNumbersByDoctorDate.get(key).add(queue.queue_number);
    }

    let appointmentsCreated = 0;
    let appointmentsUpdated = 0;
    let queuesCreated = 0;
    let queuesUpdated = 0;
    let waitPredictionsCreatedOrUpdated = 0;
    let equeueUpdated = 0;

    for (const dateValue of generatedDates) {
      const dayOfWeek = getDayOfWeekFromDate(dateValue);

      for (const doctor of doctors) {
        const scheduleKey = `${doctor.id}:${dayOfWeek}`;
        const doctorSchedules = schedulesByDoctorAndDay.get(scheduleKey) || [];
        if (!doctorSchedules.length) {
          continue;
        }

        const blockEntries = blockMap.get(`${doctor.id}:${dateValue}`) || [];
        if (blockEntries.some((block) => block.is_off)) {
          continue;
        }

        const candidateSlots = buildCandidateSlotsForDate(doctorSchedules, blockEntries);
        if (!candidateSlots.length) {
          continue;
        }

        const doctorDateKey = buildDoctorDateKey(doctor.id, dateValue);
        const usedQueueNumbers =
          usedQueueNumbersByDoctorDate.get(doctorDateKey) || new Set();
        usedQueueNumbersByDoctorDate.set(doctorDateKey, usedQueueNumbers);
        let maxQueueNumberForDoctorDate = usedQueueNumbers.size
          ? Math.max(...usedQueueNumbers)
          : 0;
        const specialtyName = doctor.Specialty?.name || "Nội tổng quát";
        const profile = getSimulationProfile(specialtyName);
        const dailyLoadFactor = randomBetween(`${doctorDateKey}|daily-load`, -0.08, 0.14);
        const openingOffsetMinutes = randomIntBetween(
          `${doctorDateKey}|opening-offset`,
          -7,
          18,
        );
        const dayPaceFactor = randomBetween(`${doctorDateKey}|pace-factor`, 0.88, 1.26);
        const forecastBiasMinutes = randomBetween(`${doctorDateKey}|forecast-bias`, -6, 12);
        const openingSlotDateTime = buildDateTime(dateValue, candidateSlots[0]);
        let actualDoctorAvailableAt = addMinutes(openingSlotDateTime, openingOffsetMinutes);
        let forecastDoctorAvailableAt = addMinutes(
          openingSlotDateTime,
          roundToNearestMinute(openingOffsetMinutes + forecastBiasMinutes),
        );

        for (const slotTime of candidateSlots) {
          const slotKey = `${doctor.id}|${dateValue}|${slotTime}`;
          const fillRatio = ratioFromKey(`${slotKey}|fill`);
          const occupancyTarget = estimateOccupancyTarget({
            doctor,
            specialtyName,
            slotTime,
            dateValue,
            dailyLoadFactor,
          });

          if (fillRatio > occupancyTarget) {
            continue;
          }

          if (ratioFromKey(`${slotKey}|no-show`) < profile.noShowRate) {
            continue;
          }

          const patient = patientResult.patients[hashString(`${slotKey}|patient`) % patientResult.patients.length];
          const reasonLabel = chooseReason(specialtyName, `${slotKey}|reason`);
          const reason = `${DEMO_REASON_PREFIX}:${doctor.id}:${dateValue}:${slotTime}:${reasonLabel}`;
          const appointmentLookupKey = `${doctor.id}|${dateValue}|${slotTime}|${reason}`;
          let appointment = appointmentByKey.get(appointmentLookupKey);
          const occupiedAppointment = occupiedAppointmentByDoctorDateSlot.get(
            `${doctor.id}|${dateValue}|${slotTime}`,
          );
          if (occupiedAppointment && occupiedAppointment.id !== appointment?.id) {
            continue;
          }
          let queue = appointment ? queueByAppointmentId.get(appointment.id) : null;
          const queueNumber =
            queue?.queue_number && Number.isInteger(Number(queue.queue_number))
              ? Number(queue.queue_number)
              : allocateNextQueueNumber(usedQueueNumbers);
          maxQueueNumberForDoctorDate = Math.max(maxQueueNumberForDoctorDate, queueNumber);

          const slotDateTime = buildDateTime(dateValue, slotTime);
          const bookingLeadDays = 1 + (hashString(`${slotKey}|lead`) % 20);
          const createdAt = new Date(slotDateTime.getTime() - bookingLeadDays * 24 * 60 * 60 * 1000);
          createdAt.setMinutes(createdAt.getMinutes() + (hashString(`${slotKey}|created-minutes`) % 120));

          const checkInLeadMinutes = buildCheckInLeadMinutes({
            slotKey,
            profile,
            queueNumber,
            dailyLoadFactor,
          });
          const priorityLevel = buildPriorityLevel({
            slotKey,
            profile,
            dailyLoadFactor,
            slotTime,
          });
          const priorityPullForwardMinutes = getPriorityStartPullForwardMinutes(priorityLevel);
          const checkedInAt = addMinutes(slotDateTime, -checkInLeadMinutes);
          const forecastUpdatedAt = addMinutes(
            checkedInAt,
            randomIntBetween(`${slotKey}|forecast-updated-delay`, 1, 4),
          );

          const expectedVisitDurationMinutes = buildExpectedVisitDurationMinutes({
            slotKey,
            profile,
            queueNumber,
            dayPaceFactor,
          });
          const earlyStartAllowanceMinutes =
            checkInLeadMinutes > 0
              ? Math.min(
                  profile.maxEarlyStartMinutes,
                  Math.max(0, checkInLeadMinutes - 2),
                )
              : 0;
          const predictedStartFloor = addMinutes(
            slotDateTime,
            -Math.min(4, Math.floor(earlyStartAllowanceMinutes / 2)),
          );
          let estimatedStart = new Date(
            Math.max(forecastDoctorAvailableAt.getTime(), predictedStartFloor.getTime()),
          );
          const forecastErrorRoll = ratioFromKey(`${slotKey}|forecast-error-scenario`);
          const forecastErrorMinutes =
            forecastErrorRoll < 0.18
              ? randomIntBetween(`${slotKey}|forecast-optimistic-error`, -14, -5)
              : forecastErrorRoll < 0.34
                ? randomIntBetween(`${slotKey}|forecast-conservative-error`, 6, 16)
                : randomIntBetween(`${slotKey}|forecast-normal-error`, -4, 7);
          estimatedStart = addMinutes(estimatedStart, forecastErrorMinutes - Math.floor(priorityPullForwardMinutes / 2));
          if (estimatedStart < addMinutes(checkedInAt, 1)) {
            estimatedStart = addMinutes(checkedInAt, randomIntBetween(`${slotKey}|forecast-floor`, 1, 5));
          }

          const actualStartFloor = addMinutes(
            slotDateTime,
            -(earlyStartAllowanceMinutes + priorityPullForwardMinutes),
          );
          const patientReadyAt =
            checkInLeadMinutes >= 0
              ? checkedInAt
              : addMinutes(checkedInAt, randomIntBetween(`${slotKey}|registration-delay`, 2, 6));
          const actualStart = new Date(
            Math.max(
              actualDoctorAvailableAt.getTime(),
              patientReadyAt.getTime(),
              actualStartFloor.getTime(),
            ),
          );
          const backlogMinutes = Math.max(0, diffMinutes(slotDateTime, actualStart));
          const visitDurationMinutes = buildVisitDurationMinutes({
            slotKey,
            profile,
            queueNumber,
            dayPaceFactor,
            backlogMinutes,
          });
          const actualEnd = addMinutes(actualStart, visitDurationMinutes);
          const predictedWaitMinutes = Math.max(0, diffMinutes(checkedInAt, estimatedStart));
          const turnaroundMinutes = buildTurnaroundMinutes({ slotKey, visitDurationMinutes });

          const appointmentValues = {
            patient_id: patient.id,
            doctor_id: doctor.id,
            date: dateValue,
            time_slot: slotTime,
            reason,
            status: "Completed",
            priority_level: priorityLevel,
            preferred_period: timeToMinutes(slotTime) < 12 * 60 ? "MORNING" : "AFTERNOON",
            hold_expires_at: null,
            created_at: createdAt,
          };

          if (!appointment) {
            appointment = await Appointment.create(appointmentValues);
            appointmentByKey.set(appointmentLookupKey, appointment);
            occupiedAppointmentByDoctorDateSlot.set(
              `${appointment.doctor_id}|${appointment.date}|${appointment.time_slot}`,
              appointment,
            );
            appointmentsCreated += 1;
          } else {
            await appointment.update(appointmentValues);
            appointmentsUpdated += 1;
          }

          queue = queueByAppointmentId.get(appointment.id) || queue;
          const queueValues = {
            doctor_id: doctor.id,
            date: dateValue,
            queue_number: queueNumber,
            checked_in_at: checkedInAt,
            original_estimated_start: slotDateTime,
            estimated_start: estimatedStart,
            forecast_updated_at: forecastUpdatedAt,
            predicted_wait_minutes: predictedWaitMinutes,
            actual_start: actualStart,
            actual_end: actualEnd,
          };

          if (!queue) {
            queue = await Queue.create({
              appointment_id: appointment.id,
              ...queueValues,
            });
            queueByAppointmentId.set(appointment.id, queue);
            queuesCreated += 1;
          } else {
            await queue.update(queueValues);
            queuesUpdated += 1;
          }

          await syncLatestPrediction(queue, predictedWaitMinutes, estimatedStart);
          waitPredictionsCreatedOrUpdated += 1;
          actualDoctorAvailableAt = addMinutes(actualEnd, turnaroundMinutes);
          forecastDoctorAvailableAt = addMinutes(
            estimatedStart,
            expectedVisitDurationMinutes + Math.max(1, turnaroundMinutes - 1),
          );
        }

        if (maxQueueNumberForDoctorDate > 0) {
          await syncEQueueNumber(doctor.id, dateValue, maxQueueNumberForDoctorDate);
          equeueUpdated += 1;
        }
      }
    }

    console.log("Training history additive seed hoàn tất.");
    console.log(
      JSON.stringify(
        {
          date_from: dateFrom,
          date_to: dateTo,
          training_patients_created: patientResult.created,
          appointments_created: appointmentsCreated,
          appointments_updated: appointmentsUpdated,
          queues_created: queuesCreated,
          queues_updated: queuesUpdated,
          wait_predictions_synced: waitPredictionsCreatedOrUpdated,
          equeue_rows_synced: equeueUpdated,
        },
        null,
        2,
      ),
    );

    process.exit(0);
  } catch (error) {
    console.error("Lỗi training history additive seed:", error);
    process.exit(1);
  }
}

seedTrainingHistoryAdditive();
