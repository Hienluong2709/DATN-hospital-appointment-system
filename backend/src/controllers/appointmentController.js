import {
  cancelAppointmentService,
  completeAppointmentService,
  createAppointmentService,
  deleteAppointmentService,
  getDoctorAvailabilityService,
  getAllAppointmentsService,
  getAppointmentByIdService,
  markAppointmentNoShowService,
  rescheduleAppointmentService,
  startAppointmentService,
} from "../services/appointmentService.js";
import { checkInAppointmentService as checkInAppointmentQueueService } from "../services/queueService.js";

const handleError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? fallbackMessage : error.message;

  return res.status(statusCode).json({ message });
};

export const getAllAppointments = async (req, res) => {
  try {
    const { items, pagination } = await getAllAppointmentsService(req.user, req.query);

    return res.json({
      message: "Lấy danh sách lịch hẹn thành công",
      data: items,
      ...(pagination ? { pagination } : {}),
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy danh sách lịch hẹn");
  }
};

export const getAppointmentById = async (req, res) => {
  try {
    const data = await getAppointmentByIdService(req.params.id);

    if (req.user?.role === "DOCTOR" && data?.Doctor?.User?.id !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xem lịch hẹn này" });
    }

    if (req.user?.role === "PATIENT" && data?.patient_id !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xem lịch hẹn này" });
    }

    return res.json({
      message: "Lấy chi tiết lịch hẹn thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy chi tiết lịch hẹn");
  }
};

export const getDoctorAvailability = async (req, res) => {
  try {
    const data = await getDoctorAvailabilityService(
      req.params.doctorId,
      req.query,
    );

    return res.json({
      message: "Lấy lịch làm việc và khung giờ trống thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy lịch làm việc của bác sĩ");
  }
};

export const createAppointment = async (req, res) => {
  try {
    const data = await createAppointmentService(req.body, req.user);

    return res.status(201).json({
      message: "Tạo lịch hẹn thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể tạo lịch hẹn");
  }
};

export const cancelAppointment = async (req, res) => {
  try {
    const data = await cancelAppointmentService(req.params.id, req.user);

    return res.json({
      message: "Hủy lịch hẹn thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể hủy lịch hẹn");
  }
};

export const markAppointmentNoShow = async (req, res) => {
  try {
    const data = await markAppointmentNoShowService(req.params.id, req.user);

    return res.json({
      message: "Ghi nhận vắng mặt thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể ghi nhận vắng mặt");
  }
};

export const checkInAppointment = async (req, res) => {
  try {
    const data = await checkInAppointmentQueueService(
      req.params.id,
      req.body,
      req.user,
    );

    return res.status(201).json({
      message: "Check-in lịch hẹn thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể check-in lịch hẹn");
  }
};

export const rescheduleAppointment = async (req, res) => {
  try {
    const data = await rescheduleAppointmentService(
      req.params.id,
      req.body,
      req.user,
    );

    return res.json({
      message: "Đổi lịch hẹn thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể đổi lịch hẹn");
  }
};

export const startAppointment = async (req, res) => {
  try {
    const data = await startAppointmentService(req.params.id, req.body, req.user);

    return res.json({
      message: "Bắt đầu lịch hẹn thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể bắt đầu lịch hẹn");
  }
};

export const completeAppointment = async (req, res) => {
  try {
    const data = await completeAppointmentService(req.params.id, req.body, req.user);

    return res.json({
      message: "Hoàn tất lịch hẹn thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể hoàn tất lịch hẹn");
  }
};

export const deleteAppointment = async (req, res) => {
  try {
    await deleteAppointmentService(req.params.id);

    return res.json({
      message: "Xóa lịch hẹn thành công",
    });
  } catch (error) {
    return handleError(res, error, "Không thể xóa lịch hẹn");
  }
};
