import { Op, fn, col, literal } from "sequelize";
import db from "../models/index.js";

const {
  sequelize,
  User,
  Doctor,
  Specialty,
  Room,
  Appointment,
  Queue,
  WaitPrediction,
  WorkSchedule,
  WorkScheduleBlock,
} = db;

const APPOINTMENT_STATUSES = ["Pending", "Confirmed", "CheckedIn", "Cancelled", "Completed", "NoShow"];

const getTodayDateString = () => {
  const current = new Date();
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const addDaysToDateOnly = (dateOnly, days) => {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const next = new Date(year, month - 1, day + days);

  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, "0"),
    String(next.getDate()).padStart(2, "0"),
  ].join("-");
};

const getCurrentDayOfWeek = () => new Date().getDay();

const toPositiveNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
};

const buildStatCard = ({ key, label, value, note, tone = "primary" }) => ({
  key,
  label,
  value,
  note,
  tone,
});

const buildAppointmentStatusBreakdown = async (where) => {
  const rows = await Appointment.findAll({
    where,
    attributes: ["status", [fn("COUNT", col("Appointment.id")), "total"]],
    group: ["status"],
    raw: true,
  });

  const countsByStatus = new Map(rows.map((row) => [row.status, toPositiveNumber(row.total)]));

  return APPOINTMENT_STATUSES.map((status) => ({
    status,
    total: countsByStatus.get(status) ?? 0,
  }));
};

const mapDoctorCard = (doctor, extras = {}) => ({
  id: doctor.id,
  name: doctor.User?.fullname ?? doctor.User?.username ?? `Bác sĩ #${doctor.id}`,
  specialty: doctor.Specialty?.name ?? null,
  room: doctor.Room?.name ?? null,
  status: doctor.status,
  ...extras,
});

const mapPatientAppointmentItem = (appointment) => ({
  id: appointment.id,
  date: appointment.date,
  time_slot: appointment.time_slot,
  status: appointment.status,
  doctor_name: appointment.Doctor?.User?.fullname ?? appointment.Doctor?.User?.username ?? `Bác sĩ #${appointment.doctor_id}`,
  specialty_name: appointment.Doctor?.Specialty?.name ?? null,
  room_name: appointment.Doctor?.Room?.name ?? null,
});

const computeRemainingWaitMinutes = (estimatedStartValue, now = new Date()) => {
  if (!estimatedStartValue) {
    return null;
  }

  const estimatedStart =
    estimatedStartValue instanceof Date ? estimatedStartValue : new Date(estimatedStartValue);
  if (Number.isNaN(estimatedStart.getTime())) {
    return null;
  }

  return Math.max(0, Math.ceil((estimatedStart.getTime() - now.getTime()) / (60 * 1000)));
};

const mapReceptionQueueItem = (queue) => ({
  id: queue.id,
  appointment_id: queue.appointment_id,
  queue_number: queue.queue_number,
  predicted_wait_minutes: queue.predicted_wait_minutes,
  remaining_wait_minutes: computeRemainingWaitMinutes(queue.estimated_start),
  estimated_start: queue.estimated_start,
  checked_in_at: queue.checked_in_at,
  patient_name:
    queue.Appointment?.patient?.fullname ??
    queue.Appointment?.patient?.username ??
    `Bệnh nhân #${queue.Appointment?.patient_id ?? ""}`.trim(),
  doctor_name:
    queue.Doctor?.User?.fullname ??
    queue.Doctor?.User?.username ??
    `Bác sĩ #${queue.doctor_id}`,
  specialty_name: queue.Doctor?.Specialty?.name ?? null,
});

const mapDoctorQueueItem = (queue) => ({
  id: queue.id,
  appointment_id: queue.appointment_id,
  queue_number: queue.queue_number,
  predicted_wait_minutes: queue.predicted_wait_minutes,
  remaining_wait_minutes: computeRemainingWaitMinutes(queue.estimated_start),
  estimated_start: queue.estimated_start,
  checked_in_at: queue.checked_in_at,
  actual_start: queue.actual_start,
  actual_end: queue.actual_end,
  patient_name:
    queue.Appointment?.patient?.fullname ??
    queue.Appointment?.patient?.username ??
    `Bệnh nhân #${queue.Appointment?.patient_id ?? ""}`.trim(),
});

const getPublicFeaturedDoctors = async () => {
  const doctors = await Doctor.findAll({
    where: { status: "Active" },
    include: [
      {
        model: User,
        attributes: ["fullname", "username"],
      },
      {
        model: Specialty,
        attributes: ["name"],
      },
      {
        model: Room,
        attributes: ["name"],
        required: false,
      },
    ],
    order: [["id", "ASC"]],
    limit: 3,
  });

  return doctors.map((doctor) =>
    mapDoctorCard(doctor, {
      description: doctor.description,
    }),
  );
};

const getPublicFeaturedSpecialties = async () => {
  const specialties = await Specialty.findAll({
    attributes: ["id", "name", "description"],
    order: [["id", "ASC"]],
    limit: 4,
  });

  return specialties.map((specialty) => ({
    id: specialty.id,
    name: specialty.name,
    description: specialty.description,
  }));
};

export const getPublicDashboardSnapshotService = async () => {
  const today = getTodayDateString();

  const [
    specialtyCount,
    activeDoctorCount,
    availableRoomCount,
    activeAppointmentCount,
    featuredDoctors,
    featuredSpecialties,
  ] = await Promise.all([
    Specialty.count(),
    Doctor.count({ where: { status: "Active" } }),
    Room.count({ where: { status: "Available" } }),
    Appointment.count({
      where: {
        date: today,
        status: {
          [Op.notIn]: ["Cancelled", "NoShow"],
        },
      },
    }),
    getPublicFeaturedDoctors(),
    getPublicFeaturedSpecialties(),
  ]);

  return {
    generated_at: new Date().toISOString(),
    stats: [
      buildStatCard({
        key: "specialties",
        label: "Chuyên khoa đang phục vụ",
        value: specialtyCount,
        note: "Danh mục dịch vụ khám hiện có",
      }),
      buildStatCard({
        key: "doctors",
        label: "Bác sĩ đang hoạt động",
        value: activeDoctorCount,
        note: "Nguồn lực khám sẵn sàng trong hệ thống",
      }),
      buildStatCard({
        key: "rooms",
        label: "Phòng khám sẵn sàng",
        value: availableRoomCount,
        note: "Phòng khám có thể tiếp nhận bệnh nhân",
      }),
      buildStatCard({
        key: "today-appointments",
        label: "Lịch khám trong ngày",
        value: activeAppointmentCount,
        note: "Không tính lịch đã hủy hoặc vắng khám",
      }),
    ],
    featured_doctors: featuredDoctors,
    featured_specialties: featuredSpecialties,
  };
};

const getAdminSummary = async () => {
  const today = getTodayDateString();

  const [
    specialtyCount,
    roomCount,
    activeDoctorCount,
    patientCount,
    appointmentTodayCount,
    waitingQueueCount,
    inProgressQueueCount,
    completedTodayCount,
    predictionQualityRows,
    appointmentStatuses,
    topDoctorRows,
  ] = await Promise.all([
    Specialty.count(),
    Room.count(),
    Doctor.count({ where: { status: "Active" } }),
    User.count({ where: { role: "PATIENT" } }),
    Appointment.count({
      where: {
        date: today,
        status: {
          [Op.notIn]: ["Cancelled", "NoShow"],
        },
      },
    }),
    Queue.count({
      where: {
        date: today,
        checked_in_at: { [Op.ne]: null },
        actual_start: null,
      },
    }),
    Queue.count({
      where: {
        date: today,
        actual_start: { [Op.ne]: null },
        actual_end: null,
      },
    }),
    Appointment.count({
      where: {
        date: today,
        status: "Completed",
      },
    }),
    WaitPrediction.findAll({
      attributes: [
        [fn("AVG", col("absolute_error_minutes")), "avg_absolute_error_minutes"],
        [fn("COUNT", col("WaitPrediction.id")), "evaluated_count"],
      ],
      where: {
        evaluated_at: { [Op.ne]: null },
        absolute_error_minutes: { [Op.ne]: null },
      },
      include: [
        {
          model: Queue,
          attributes: [],
          where: { date: today },
        },
      ],
      raw: true,
    }),
    buildAppointmentStatusBreakdown({ date: today }),
    Appointment.findAll({
      where: {
        date: today,
        status: {
          [Op.notIn]: ["Cancelled", "NoShow"],
        },
      },
      attributes: ["doctor_id", [fn("COUNT", col("Appointment.id")), "appointment_count"]],
      group: ["doctor_id"],
      order: [[literal("appointment_count"), "DESC"]],
      limit: 5,
      raw: true,
    }),
  ]);

  const topDoctorIds = topDoctorRows.map((row) => Number(row.doctor_id)).filter(Boolean);
  const doctors = topDoctorIds.length
    ? await Doctor.findAll({
        where: { id: topDoctorIds },
        include: [
          { model: User, attributes: ["fullname", "username"] },
          { model: Specialty, attributes: ["name"] },
          { model: Room, attributes: ["name"], required: false },
        ],
      })
    : [];

  const doctorsById = new Map(doctors.map((doctor) => [doctor.id, doctor]));
  const predictionQuality = predictionQualityRows?.[0] || {};
  const evaluatedPredictionCount = toPositiveNumber(predictionQuality.evaluated_count);
  const averagePredictionError = Number(predictionQuality.avg_absolute_error_minutes);

  return {
    role: "ADMIN",
    generated_at: new Date().toISOString(),
    kpis: [
      buildStatCard({
        key: "specialties",
        label: "Chuyên khoa",
        value: specialtyCount,
        note: "Danh mục dịch vụ đang quản lý",
      }),
      buildStatCard({
        key: "rooms",
        label: "Phòng khám",
        value: roomCount,
        note: "Tổng số phòng khám trong hệ thống",
      }),
      buildStatCard({
        key: "active-doctors",
        label: "Bác sĩ hoạt động",
        value: activeDoctorCount,
        note: "Bác sĩ đang sẵn sàng phục vụ",
      }),
      buildStatCard({
        key: "patients",
        label: "Bệnh nhân",
        value: patientCount,
        note: "Tài khoản bệnh nhân đã đăng ký",
      }),
      buildStatCard({
        key: "today-appointments",
        label: "Lịch khám hôm nay",
        value: appointmentTodayCount,
        note: "Không tính lịch hủy hoặc vắng khám",
        tone: "success",
      }),
      buildStatCard({
        key: "waiting-queues",
        label: "Đang chờ khám",
        value: waitingQueueCount,
        note: `${inProgressQueueCount} ca đang khám, ${completedTodayCount} ca đã hoàn tất`,
        tone: "warning",
      }),
      buildStatCard({
        key: "wait-prediction-quality",
        label: "Sai số dự đoán TB",
        value: evaluatedPredictionCount > 0 && Number.isFinite(averagePredictionError)
          ? `${averagePredictionError.toFixed(1)} phút`
          : "Chưa có",
        note: evaluatedPredictionCount > 0
          ? `${evaluatedPredictionCount} dự đoán đã được đối chiếu hôm nay`
          : "Sẽ có dữ liệu sau khi bác sĩ bắt đầu khám",
        tone: evaluatedPredictionCount > 0 ? "primary" : "neutral",
      }),
    ],
    appointment_statuses: appointmentStatuses,
    top_doctors_today: topDoctorRows
      .map((row) => {
        const doctor = doctorsById.get(Number(row.doctor_id));
        if (!doctor) {
          return null;
        }

        return mapDoctorCard(doctor, {
          appointment_count: toPositiveNumber(row.appointment_count),
        });
      })
      .filter(Boolean),
  };
};

const getReceptionistSummary = async () => {
  const today = getTodayDateString();

  const [
    appointmentTodayCount,
    pendingCheckInCount,
    waitingQueueCount,
    inProgressQueueCount,
    completedTodayCount,
    availableRoomCount,
    nextAppointments,
    queueItems,
  ] = await Promise.all([
    Appointment.count({
      where: {
        date: today,
        status: {
          [Op.notIn]: ["Cancelled", "NoShow"],
        },
      },
    }),
    Appointment.count({
      where: {
        date: today,
        status: {
          [Op.in]: ["Pending", "Confirmed"],
        },
      },
    }),
    Queue.count({
      where: {
        date: today,
        checked_in_at: { [Op.ne]: null },
        actual_start: null,
      },
    }),
    Queue.count({
      where: {
        date: today,
        actual_start: { [Op.ne]: null },
        actual_end: null,
      },
    }),
    Appointment.count({
      where: {
        date: today,
        status: "Completed",
      },
    }),
    Room.count({ where: { status: "Available" } }),
    Appointment.findAll({
      where: {
        date: today,
        status: {
          [Op.in]: ["Pending", "Confirmed"],
        },
      },
      include: [
        {
          model: User,
          as: "patient",
          attributes: ["fullname", "username"],
        },
        {
          model: Doctor,
          attributes: ["id"],
          include: [
            { model: User, attributes: ["fullname", "username"] },
            { model: Specialty, attributes: ["name"] },
            { model: Room, attributes: ["name"], required: false },
          ],
        },
      ],
      order: [["time_slot", "ASC"], ["id", "ASC"]],
      limit: 5,
    }),
    Queue.findAll({
      where: {
        date: today,
        checked_in_at: { [Op.ne]: null },
        actual_start: null,
      },
      include: [
        {
          model: Appointment,
          attributes: ["id", "patient_id"],
          include: [
            {
              model: User,
              as: "patient",
              attributes: ["fullname", "username"],
            },
          ],
        },
        {
          model: Doctor,
          attributes: ["id"],
          include: [
            { model: User, attributes: ["fullname", "username"] },
            { model: Specialty, attributes: ["name"] },
          ],
        },
      ],
      order: [["checked_in_at", "ASC"], ["queue_number", "ASC"]],
      limit: 5,
    }),
  ]);

  return {
    role: "RECEPTIONIST",
    generated_at: new Date().toISOString(),
    kpis: [
      buildStatCard({
        key: "today-appointments",
        label: "Lịch khám hôm nay",
        value: appointmentTodayCount,
        note: "Tổng số lịch cần điều phối trong ngày",
      }),
      buildStatCard({
        key: "pending-checkin",
        label: "Chờ check-in",
        value: pendingCheckInCount,
        note: "Lịch hẹn chưa hoàn tất thủ tục tiếp đón",
        tone: "warning",
      }),
      buildStatCard({
        key: "waiting-queue",
        label: "Đang chờ khám",
        value: waitingQueueCount,
        note: "Bệnh nhân đã check-in, chưa vào khám",
      }),
      buildStatCard({
        key: "in-progress",
        label: "Đang khám",
        value: inProgressQueueCount,
        note: `${completedTodayCount} lịch đã hoàn tất hôm nay`,
        tone: "success",
      }),
      buildStatCard({
        key: "available-rooms",
        label: "Phòng sẵn sàng",
        value: availableRoomCount,
        note: "Phòng khám có thể tiếp nhận ngay",
      }),
    ],
    next_appointments: nextAppointments.map((appointment) => ({
      id: appointment.id,
      date: appointment.date,
      time_slot: appointment.time_slot,
      status: appointment.status,
      patient_name:
        appointment.patient?.fullname ??
        appointment.patient?.username ??
        `Bệnh nhân #${appointment.patient_id}`,
      doctor_name:
        appointment.Doctor?.User?.fullname ??
        appointment.Doctor?.User?.username ??
        `Bác sĩ #${appointment.doctor_id}`,
      specialty_name: appointment.Doctor?.Specialty?.name ?? null,
      room_name: appointment.Doctor?.Room?.name ?? null,
    })),
    waiting_queues: queueItems.map(mapReceptionQueueItem),
  };
};

const getDoctorSummary = async (user) => {
  const today = getTodayDateString();
  const doctor = await Doctor.findOne({
    where: { user_id: Number(user.id) },
    include: [
      { model: User, attributes: ["fullname", "username"] },
      { model: Specialty, attributes: ["name"] },
      { model: Room, attributes: ["name"], required: false },
    ],
  });

  if (!doctor) {
    return {
      role: "DOCTOR",
      generated_at: new Date().toISOString(),
      doctor: null,
      kpis: [
        buildStatCard({
          key: "profile-missing",
          label: "Hồ sơ bác sĩ",
          value: 0,
          note: "Tài khoản chưa liên kết với hồ sơ bác sĩ",
          tone: "warning",
        }),
      ],
      next_patients: [],
      active_queues: [],
      schedules_today: [],
      blocks_today: [],
    };
  }

  const dayOfWeek = getCurrentDayOfWeek();
  const [
    appointmentTodayCount,
    waitingQueueCount,
    inProgressQueueCount,
    completedTodayCount,
    scheduleRows,
    blockRows,
    nextPatients,
    activeQueueRows,
  ] = await Promise.all([
    Appointment.count({
      where: {
        doctor_id: doctor.id,
        date: today,
        status: {
          [Op.notIn]: ["Cancelled", "NoShow"],
        },
      },
    }),
    Queue.count({
      where: {
        doctor_id: doctor.id,
        date: today,
        checked_in_at: { [Op.ne]: null },
        actual_start: null,
      },
    }),
    Queue.count({
      where: {
        doctor_id: doctor.id,
        date: today,
        actual_start: { [Op.ne]: null },
        actual_end: null,
      },
    }),
    Appointment.count({
      where: {
        doctor_id: doctor.id,
        date: today,
        status: "Completed",
      },
    }),
    WorkSchedule.findAll({
      where: {
        doctor_id: doctor.id,
        day_of_week: dayOfWeek,
      },
      order: [["start_time", "ASC"]],
      raw: true,
    }),
    WorkScheduleBlock.findAll({
      where: {
        doctor_id: doctor.id,
        date: today,
        status: "Approved",
      },
      order: [["start_time", "ASC"], ["id", "ASC"]],
      raw: true,
    }),
    Appointment.findAll({
      where: {
        doctor_id: doctor.id,
        date: today,
        status: {
          [Op.in]: ["Pending", "Confirmed", "CheckedIn"],
        },
      },
      include: [
        {
          model: User,
          as: "patient",
          attributes: ["fullname", "username"],
        },
      ],
      order: [["time_slot", "ASC"], ["id", "ASC"]],
      limit: 6,
    }),
    Queue.findAll({
      where: {
        doctor_id: doctor.id,
        date: today,
        checked_in_at: { [Op.ne]: null },
        actual_end: null,
      },
      include: [
        {
          model: Appointment,
          attributes: ["id", "patient_id"],
          include: [
            {
              model: User,
              as: "patient",
              attributes: ["fullname", "username"],
            },
          ],
        },
      ],
      order: [["queue_number", "ASC"]],
      limit: 6,
    }),
  ]);

  return {
    role: "DOCTOR",
    generated_at: new Date().toISOString(),
    doctor: mapDoctorCard(doctor),
    kpis: [
      buildStatCard({
        key: "today-appointments",
        label: "Lịch khám hôm nay",
        value: appointmentTodayCount,
        note: `${completedTodayCount} lịch đã hoàn tất`,
      }),
      buildStatCard({
        key: "waiting-patients",
        label: "Bệnh nhân đang chờ",
        value: waitingQueueCount,
        note: "Đã check-in, chưa vào khám",
      }),
      buildStatCard({
        key: "in-progress",
        label: "Ca đang khám",
        value: inProgressQueueCount,
        note: "Theo dõi tiến độ trong phòng khám",
        tone: "success",
      }),
      buildStatCard({
        key: "schedule-slots",
        label: "Khung giờ hôm nay",
        value: scheduleRows.length,
        note: `${blockRows.length} điều chỉnh / block trong ngày`,
      }),
    ],
    next_patients: nextPatients.map((appointment) => ({
      id: appointment.id,
      date: appointment.date,
      time_slot: appointment.time_slot,
      status: appointment.status,
      patient_name:
        appointment.patient?.fullname ??
        appointment.patient?.username ??
        `Bệnh nhân #${appointment.patient_id}`,
    })),
    active_queues: activeQueueRows.map(mapDoctorQueueItem),
    schedules_today: scheduleRows,
    blocks_today: blockRows,
  };
};

const getPatientSummary = async (user) => {
  const today = getTodayDateString();
  const tomorrow = addDaysToDateOnly(today, 1);

  const [
    upcomingCount,
    activeRequestCount,
    waitingTodayCount,
    completedVisitCount,
    cancelledVisitCount,
    nextAppointments,
    recentVisits,
    activeDoctorCount,
    specialtyCount,
  ] = await Promise.all([
    Appointment.count({
      where: {
        patient_id: Number(user.id),
        date: {
          [Op.gte]: today,
        },
        status: {
          [Op.in]: ["Pending", "Confirmed", "CheckedIn"],
        },
      },
    }),
    Appointment.count({
      where: {
        patient_id: Number(user.id),
        date: {
          [Op.gte]: tomorrow,
        },
        status: {
          [Op.in]: ["Pending", "Confirmed"],
        },
      },
    }),
    Queue.count({
      where: {
        date: today,
        checked_in_at: { [Op.ne]: null },
        actual_start: null,
      },
      include: [
        {
          model: Appointment,
          required: true,
          attributes: [],
          where: {
            patient_id: Number(user.id),
          },
        },
      ],
    }),
    Appointment.count({
      where: {
        patient_id: Number(user.id),
        status: "Completed",
      },
    }),
    Appointment.count({
      where: {
        patient_id: Number(user.id),
        status: {
          [Op.in]: ["Cancelled", "NoShow"],
        },
      },
    }),
    Appointment.findAll({
      where: {
        patient_id: Number(user.id),
        date: {
          [Op.gte]: today,
        },
        status: {
          [Op.in]: ["Pending", "Confirmed", "CheckedIn"],
        },
      },
      include: [
        {
          model: Doctor,
          attributes: ["id"],
          include: [
            { model: User, attributes: ["fullname", "username"] },
            { model: Specialty, attributes: ["name"] },
            { model: Room, attributes: ["name"], required: false },
          ],
        },
      ],
      order: [["date", "ASC"], ["time_slot", "ASC"], ["id", "ASC"]],
      limit: 4,
    }),
    Appointment.findAll({
      where: {
        patient_id: Number(user.id),
        status: "Completed",
      },
      include: [
        {
          model: Doctor,
          attributes: ["id"],
          include: [
            { model: User, attributes: ["fullname", "username"] },
            { model: Specialty, attributes: ["name"] },
            { model: Room, attributes: ["name"], required: false },
          ],
        },
      ],
      order: [["date", "DESC"], ["time_slot", "DESC"], ["id", "DESC"]],
      limit: 3,
    }),
    Doctor.count({ where: { status: "Active" } }),
    Specialty.count(),
  ]);

  return {
    role: "PATIENT",
    generated_at: new Date().toISOString(),
    kpis: [
      buildStatCard({
        key: "upcoming-appointments",
        label: "Lịch khám sắp tới",
        value: upcomingCount,
        note: "Bao gồm các lịch đã xác nhận và đã check-in",
      }),
      buildStatCard({
        key: "active-requests",
        label: "Yêu cầu đang hiệu lực",
        value: activeRequestCount,
        note: "Lịch sắp tới chưa tới ngày check-in",
      }),
      buildStatCard({
        key: "waiting-today",
        label: "Đang chờ hôm nay",
        value: waitingTodayCount,
        note: "Đã check-in, đang đợi vào khám",
        tone: "warning",
      }),
      buildStatCard({
        key: "completed-visits",
        label: "Lượt khám đã hoàn tất",
        value: completedVisitCount,
        note: `${cancelledVisitCount} lịch đã hủy hoặc vắng khám`,
        tone: "success",
      }),
      buildStatCard({
        key: "available-doctors",
        label: "Bác sĩ trong hệ thống",
        value: activeDoctorCount,
        note: `${specialtyCount} chuyên khoa đang phục vụ`,
      }),
    ],
    next_appointments: nextAppointments.map(mapPatientAppointmentItem),
    recent_visits: recentVisits.map(mapPatientAppointmentItem),
  };
};

export const getDashboardSummaryService = async (user) => {
  if (!user?.role) {
    const error = new Error("Không xác định được vai trò người dùng");
    error.statusCode = 401;
    throw error;
  }

  switch (user.role) {
    case "ADMIN":
      return getAdminSummary();
    case "RECEPTIONIST":
      return getReceptionistSummary();
    case "DOCTOR":
      return getDoctorSummary(user);
    case "PATIENT":
      return getPatientSummary(user);
    default: {
      const error = new Error("Vai trò người dùng không được hỗ trợ");
      error.statusCode = 403;
      throw error;
    }
  }
};
