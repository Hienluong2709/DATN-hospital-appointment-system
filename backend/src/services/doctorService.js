import db from "../models/index.js";
import { Op } from "sequelize";

const { Doctor, User, Specialty, Room, WorkSchedule, WorkScheduleBlock, Appointment } = db;

const ALLOWED_DOCTOR_STATUS = ["Active", "Inactive"];
const ACTIVE_APPOINTMENT_STATUSES = ["Confirmed", "CheckedIn", "Completed"];
const BUSINESS_TIMEZONE_OFFSET = process.env.BUSINESS_TIMEZONE_OFFSET || "+07:00";
const normalizeNonNegativeIntegerEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
};
const PATIENT_MIN_BOOKING_DAYS_IN_ADVANCE = normalizeNonNegativeIntegerEnv(
  process.env.PATIENT_MIN_BOOKING_DAYS_IN_ADVANCE,
  1,
);

const parseDateParts = (dateValue) => {
  const [year, month, day] = dateValue.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() + 1 !== month ||
    parsedDate.getUTCDate() !== day
  ) {
    const error = new Error("date không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return { year, month, day };
};

const normalizeSlotMinutes = (value) => {
  if (value === undefined || value === null || value === "") {
    return 30;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 180) {
    const error = new Error(
      "slot_minutes phải là số nguyên trong khoảng 1 đến 180",
    );
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

const parseId = (id) => {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error("ID không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  return parsed;
};

const normalizeStatus = (status) => {
  if (status === undefined || status === null || status === "") {
    return undefined;
  }

  if (!ALLOWED_DOCTOR_STATUS.includes(status)) {
    const error = new Error("Trạng thái bác sĩ không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  return status;
};

const normalizeDate = (value) => {
  if (typeof value !== "string") {
    const error = new Error("date là bắt buộc");
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const error = new Error("date không hợp lệ, định dạng YYYY-MM-DD");
    error.statusCode = 400;
    throw error;
  }

  parseDateParts(trimmed);

  return trimmed;
};

const parseUtcOffsetToMinutes = (offsetValue) => {
  const matched = /^([+-])(\d{2}):(\d{2})$/.exec(offsetValue);
  if (!matched) {
    throw new Error("BUSINESS_TIMEZONE_OFFSET không hợp lệ");
  }

  const sign = matched[1] === "+" ? 1 : -1;
  return sign * (Number(matched[2]) * 60 + Number(matched[3]));
};

const BUSINESS_TIMEZONE_OFFSET_MINUTES = parseUtcOffsetToMinutes(BUSINESS_TIMEZONE_OFFSET);

const getCurrentBusinessDateAndSeconds = () => {
  const shifted = new Date(Date.now() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");

  return {
    date: `${year}-${month}-${day}`,
    seconds:
      shifted.getUTCHours() * 3600 +
      shifted.getUTCMinutes() * 60 +
      shifted.getUTCSeconds(),
  };
};

const getDayOfWeekFromDate = (dateValue) => {
  const { year, month, day } = parseDateParts(dateValue);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const timeToSeconds = (timeValue) => {
  const [hours, minutes, seconds] = String(timeValue).split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};

const secondsToTime = (secondsValue) => {
  const hours = String(Math.floor(secondsValue / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((secondsValue % 3600) / 60)).padStart(
    2,
    "0",
  );
  const seconds = String(secondsValue % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

const toTimeString = (value) => String(value).slice(0, 8);

const doesTimeRangeOverlap = (startA, endA, startB, endB) => {
  return startA < endB && endA > startB;
};

const isSlotBlocked = (slotTime, slotMinutes, blockRanges) => {
  if (blockRanges.length === 0) {
    return false;
  }

  const slotStart = timeToSeconds(slotTime);
  const slotEnd = slotStart + slotMinutes * 60;

  return blockRanges.some((block) =>
    doesTimeRangeOverlap(slotStart, slotEnd, block.startSeconds, block.endSeconds)
  );
};

const buildTimeSlots = (startTime, endTime, slotMinutes) => {
  const step = slotMinutes * 60;
  const startSeconds = timeToSeconds(startTime);
  const endSeconds = timeToSeconds(endTime);
  const slots = [];

  for (let cursor = startSeconds; cursor + step <= endSeconds; cursor += step) {
    slots.push(secondsToTime(cursor));
  }

  return slots;
};

const filterPastSlotsForDate = (slots, date, slotMinutes) => {
  const { date: currentBusinessDate, seconds: currentBusinessSeconds } = getCurrentBusinessDateAndSeconds();

  if (date !== currentBusinessDate) {
    return slots;
  }

  return slots.filter((slot) => timeToSeconds(slot) + slotMinutes * 60 > currentBusinessSeconds);
};

const getMinimumPatientBookingDateString = () => {
  const { date } = getCurrentBusinessDateAndSeconds();
  const { year, month, day } = parseDateParts(date);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + PATIENT_MIN_BOOKING_DAYS_IN_ADVANCE);
  return next.toISOString().slice(0, 10);
};

const ensureUserExists = async (userId) => {
  const parsedUserId = parseId(userId);
  const user = await User.findByPk(parsedUserId);

  if (!user) {
    const error = new Error("Không tìm thấy người dùng");
    error.statusCode = 404;
    throw error;
  }

  if (user.role !== "DOCTOR") {
    const error = new Error("Người dùng không có vai trò bác sĩ");
    error.statusCode = 400;
    throw error;
  }

  return parsedUserId;
};

const ensureSpecialtyExists = async (specialtyId) => {
  const parsedSpecialtyId = parseId(specialtyId);
  const specialty = await Specialty.findByPk(parsedSpecialtyId);

  if (!specialty) {
    const error = new Error("Không tìm thấy chuyên khoa");
    error.statusCode = 404;
    throw error;
  }

  return parsedSpecialtyId;
};

const ensureRoomExists = async (roomId) => {
  if (roomId === undefined || roomId === null || roomId === "") {
    return null;
  }

  const parsedRoomId = parseId(roomId);
  const room = await Room.findByPk(parsedRoomId);

  if (!room) {
    const error = new Error("Không tìm thấy phòng");
    error.statusCode = 404;
    throw error;
  }

  return room;
};

const ensureRoomMatchesSpecialty = (room, specialtyId) => {
  if (!room) {
    return;
  }

  if (room.specialty_id !== specialtyId) {
    const error = new Error("Phòng không thuộc chuyên khoa đã chọn");
    error.statusCode = 400;
    throw error;
  }
};

const ensureNoRoomTimeConflict = async (doctorId, roomId, transaction) => {
  if (!roomId) {
    return;
  }

  const schedules = await WorkSchedule.findAll({
    where: { doctor_id: doctorId },
    attributes: ["day_of_week", "start_time", "end_time"],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (schedules.length === 0) {
    return;
  }

  const otherDoctors = await Doctor.findAll({
    where: {
      room_id: roomId,
      id: { [Op.ne]: doctorId },
    },
    attributes: ["id"],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (otherDoctors.length === 0) {
    return;
  }

  const otherDoctorIds = otherDoctors.map((item) => item.id);

  for (const schedule of schedules) {
    const conflict = await WorkSchedule.findOne({
      where: {
        doctor_id: { [Op.in]: otherDoctorIds },
        day_of_week: schedule.day_of_week,
        start_time: { [Op.lt]: schedule.end_time },
        end_time: { [Op.gt]: schedule.start_time },
      },
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    });

    if (conflict) {
      const error = new Error("Phòng này đã được bác sĩ khác sử dụng trong khung giờ làm việc hiện tại");
      error.statusCode = 409;
      throw error;
    }
  }
};

const doctorQueryOptions = {
  include: [
    {
      model: User,
      attributes: ["id", "username", "fullname", "email", "phone", "role"],
    },
    {
      model: Specialty,
      attributes: ["id", "name"],
    },
    {
      model: Room,
      attributes: ["id", "name", "floor", "specialty_id"],
    },
  ],
  order: [["id", "ASC"]],
};

export const getAllDoctorsService = async () => {
  return Doctor.findAll(doctorQueryOptions);
};

export const getDoctorsBySpecialtyAndDateService = async (query, currentUser) => {
  const specialtyId = await ensureSpecialtyExists(query?.specialty_id);
  const date = normalizeDate(query?.date);
  if (
    currentUser?.role === "PATIENT" &&
    PATIENT_MIN_BOOKING_DAYS_IN_ADVANCE > 0 &&
    date < getMinimumPatientBookingDateString()
  ) {
    return [];
  }

  const dayOfWeek = getDayOfWeekFromDate(date);
  const slotMinutes = normalizeSlotMinutes(query?.slot_minutes);

  const doctors = await Doctor.findAll({
    where: {
      specialty_id: specialtyId,
      status: "Active",
    },
    include: [
      ...doctorQueryOptions.include,
      {
        model: WorkSchedule,
        attributes: ["id", "day_of_week", "start_time", "end_time"],
        where: { day_of_week: dayOfWeek },
        required: true,
      },
    ],
    order: [["id", "ASC"]],
  });

  if (doctors.length === 0) {
    return [];
  }

  const doctorIds = doctors.map((doctor) => doctor.id);
  const appointments = await Appointment.findAll({
    where: {
      doctor_id: { [Op.in]: doctorIds },
      date,
      status: { [Op.in]: ACTIVE_APPOINTMENT_STATUSES },
    },
    attributes: ["doctor_id", "time_slot"],
  });

  const blocks = await WorkScheduleBlock.findAll({
    where: {
      doctor_id: { [Op.in]: doctorIds },
      date,
    },
    attributes: ["doctor_id", "is_off", "start_time", "end_time"],
  });

  const bookedByDoctor = new Map();
  const activeAppointmentsCountByDoctor = new Map();
  for (const item of appointments) {
    const doctorId = item.doctor_id;
    activeAppointmentsCountByDoctor.set(
      doctorId,
      (activeAppointmentsCountByDoctor.get(doctorId) || 0) + 1,
    );

    if (!item.time_slot) {
      continue;
    }

    const timeSlot = String(item.time_slot).slice(0, 8);

    if (!bookedByDoctor.has(doctorId)) {
      bookedByDoctor.set(doctorId, new Set());
    }

    bookedByDoctor.get(doctorId).add(timeSlot);
  }

  const blocksByDoctor = new Map();
  for (const item of blocks) {
    if (!blocksByDoctor.has(item.doctor_id)) {
      blocksByDoctor.set(item.doctor_id, []);
    }

    blocksByDoctor.get(item.doctor_id).push(item);
  }

  const doctorsWithAvailableSlots = doctors
    .map((doctor) => {
      const plainDoctor = doctor.get({ plain: true });
      const workSchedules = plainDoctor.WorkSchedules || [];
      const doctorBlocks = blocksByDoctor.get(doctor.id) || [];

      if (doctorBlocks.some((block) => block.is_off)) {
        return null;
      }

      const candidateSlots = new Set();

      for (const schedule of workSchedules) {
        const slots = buildTimeSlots(
          toTimeString(schedule.start_time),
          toTimeString(schedule.end_time),
          slotMinutes,
        );

        for (const slot of slots) {
          candidateSlots.add(slot);
        }
      }

      const sortedCandidates = Array.from(candidateSlots).sort();
      const blockRanges = doctorBlocks
        .filter((block) => !block.is_off && block.start_time && block.end_time)
        .map((block) => ({
          startSeconds: timeToSeconds(toTimeString(block.start_time)),
          endSeconds: timeToSeconds(toTimeString(block.end_time)),
        }));
      const capacitySlots = filterPastSlotsForDate(
        sortedCandidates.filter(
          (slot) => !isSlotBlocked(slot, slotMinutes, blockRanges),
        ),
        date,
        slotMinutes,
      );
      const activeAppointmentsCount = activeAppointmentsCountByDoctor.get(doctor.id) || 0;
      const remainingBookingCapacity = capacitySlots.length - activeAppointmentsCount;

      if (remainingBookingCapacity <= 0) {
        return null;
      }

      const bookedSlots = Array.from(bookedByDoctor.get(doctor.id) || []).sort();
      const bookedSet = new Set(bookedSlots);
      const availableSlots = filterPastSlotsForDate(
        sortedCandidates.filter(
          (slot) => !bookedSet.has(slot) && !isSlotBlocked(slot, slotMinutes, blockRanges),
        ),
        date,
        slotMinutes,
      );

      if (availableSlots.length === 0) {
        return null;
      }

      const doctorName =
        plainDoctor.User?.fullname ||
        plainDoctor.User?.username ||
        `Doctor ${plainDoctor.id}`;

      return {
        doctor_id: plainDoctor.id,
        name: doctorName,
        room: plainDoctor.Room?.name || null,
        available_slots: availableSlots.slice(0, remainingBookingCapacity),
        available_slots_count: remainingBookingCapacity,
      };
    })
    .filter(Boolean);

  return doctorsWithAvailableSlots;
};

export const getDoctorByIdService = async (id) => {
  const doctorId = parseId(id);
  const doctor = await Doctor.findByPk(doctorId, {
    include: doctorQueryOptions.include,
  });

  if (!doctor) {
    const error = new Error("Không tìm thấy bác sĩ");
    error.statusCode = 404;
    throw error;
  }

  return doctor;
};

export const createDoctorService = async (payload) => {
  const normalizedUserId = await ensureUserExists(payload?.user_id);
  const normalizedSpecialtyId = await ensureSpecialtyExists(
    payload?.specialty_id,
  );
  const room = await ensureRoomExists(payload?.room_id);

  ensureRoomMatchesSpecialty(room, normalizedSpecialtyId);

  const duplicateDoctor = await Doctor.findOne({
    where: { user_id: normalizedUserId },
  });
  if (duplicateDoctor) {
    const error = new Error("Người dùng này đã được gán làm bác sĩ");
    error.statusCode = 409;
    throw error;
  }

  const normalizedStatus = normalizeStatus(payload?.status);
  const normalizedDescription = payload?.description?.trim() || null;

  const created = await Doctor.create({
    user_id: normalizedUserId,
    specialty_id: normalizedSpecialtyId,
    room_id: room ? room.id : null,
    description: normalizedDescription,
    status: normalizedStatus,
  });

  return getDoctorByIdService(created.id);
};

export const updateDoctorService = async (id, payload) => {
  const doctorId = parseId(id);
  const doctor = await Doctor.findByPk(doctorId);

  if (!doctor) {
    const error = new Error("Không tìm thấy bác sĩ");
    error.statusCode = 404;
    throw error;
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(payload, "user_id")) {
    const normalizedUserId = await ensureUserExists(payload.user_id);

    const duplicateDoctor = await Doctor.findOne({
      where: { user_id: normalizedUserId },
    });
    if (duplicateDoctor && duplicateDoctor.id !== doctor.id) {
      const error = new Error("Người dùng này đã được gán làm bác sĩ");
      error.statusCode = 409;
      throw error;
    }

    updates.user_id = normalizedUserId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "specialty_id")) {
    updates.specialty_id = await ensureSpecialtyExists(payload.specialty_id);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "room_id")) {
    const room = await ensureRoomExists(payload.room_id);
    updates.room_id = room ? room.id : null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    updates.status = normalizeStatus(payload.status);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "description")) {
    updates.description = payload.description?.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    const error = new Error("Không có dữ liệu để cập nhật");
    error.statusCode = 400;
    throw error;
  }

  const effectiveSpecialtyId =
    updates.specialty_id !== undefined
      ? updates.specialty_id
      : doctor.specialty_id;
  const effectiveRoomId =
    updates.room_id !== undefined ? updates.room_id : doctor.room_id;

  if (effectiveRoomId !== null) {
    const room = await Room.findByPk(effectiveRoomId);
    ensureRoomMatchesSpecialty(room, effectiveSpecialtyId);
  }

  if (
    Object.prototype.hasOwnProperty.call(updates, "room_id") &&
    updates.room_id !== doctor.room_id
  ) {
    await ensureNoRoomTimeConflict(doctor.id, updates.room_id, null);
  }

  await doctor.update(updates);
  return getDoctorByIdService(doctor.id);
};

export const deleteDoctorService = async (id) => {
  const doctorId = parseId(id);
  const doctor = await Doctor.findByPk(doctorId);

  if (!doctor) {
    const error = new Error("Không tìm thấy bác sĩ");
    error.statusCode = 404;
    throw error;
  }

  const [scheduleCount, appointmentCount] = await Promise.all([
    WorkSchedule.count({ where: { doctor_id: doctorId } }),
    Appointment.count({ where: { doctor_id: doctorId } }),
  ]);

  if (scheduleCount > 0 || appointmentCount > 0) {
    const error = new Error(
      "Không thể xóa bác sĩ đang có lịch làm việc hoặc lịch hẹn",
    );
    error.statusCode = 409;
    throw error;
  }

  await doctor.destroy();
};
