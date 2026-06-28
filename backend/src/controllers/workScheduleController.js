import {
  createWorkScheduleService,
  deleteWorkScheduleService,
  getAllWorkSchedulesService,
  getWorkScheduleByIdService,
  updateWorkScheduleService,
} from "../services/workScheduleService.js";

const handleError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? fallbackMessage : error.message;

  return res.status(statusCode).json({ message });
};

export const getAllWorkSchedules = async (req, res) => {
  try {
    const data = await getAllWorkSchedulesService(req.user);

    return res.json({
      message: "Lấy danh sách lịch làm việc thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy danh sách lịch làm việc");
  }
};

export const getWorkScheduleById = async (req, res) => {
  try {
    const data = await getWorkScheduleByIdService(req.params.id);

    if (req.user?.role === "DOCTOR" && data?.Doctor?.User?.id !== req.user.id) {
      return res.status(403).json({ message: "Bạn không có quyền xem lịch làm việc này" });
    }

    return res.json({
      message: "Lấy chi tiết lịch làm việc thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy chi tiết lịch làm việc");
  }
};

export const createWorkSchedule = async (req, res) => {
  try {
    const data = await createWorkScheduleService(req.body);

    return res.status(201).json({
      message: "Tạo lịch làm việc thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể tạo lịch làm việc");
  }
};

export const updateWorkSchedule = async (req, res) => {
  try {
    const data = await updateWorkScheduleService(req.params.id, req.body);

    return res.json({
      message: "Cập nhật lịch làm việc thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể cập nhật lịch làm việc");
  }
};

export const deleteWorkSchedule = async (req, res) => {
  try {
    await deleteWorkScheduleService(req.params.id);

    return res.json({
      message: "Xóa lịch làm việc thành công",
    });
  } catch (error) {
    return handleError(res, error, "Không thể xóa lịch làm việc");
  }
};