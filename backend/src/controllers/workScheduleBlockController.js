import {
  createWorkScheduleBlockService,
  deleteWorkScheduleBlockService,
  getAllWorkScheduleBlocksService,
  getWorkScheduleBlockByIdService,
  reviewWorkScheduleBlockService,
  updateWorkScheduleBlockService,
} from "../services/workScheduleBlockService.js";

const handleError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? fallbackMessage : error.message;

  return res.status(statusCode).json({ message });
};

export const getAllWorkScheduleBlocks = async (req, res) => {
  try {
    const data = await getAllWorkScheduleBlocksService(req.user);

    return res.json({
      message: "Lấy danh sách lịch nghỉ thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy danh sách lịch nghỉ");
  }
};

export const getWorkScheduleBlockById = async (req, res) => {
  try {
    const data = await getWorkScheduleBlockByIdService(req.params.id, undefined, req.user);

    return res.json({
      message: "Lấy chi tiết lịch nghỉ thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy chi tiết lịch nghỉ");
  }
};

export const createWorkScheduleBlock = async (req, res) => {
  try {
    const data = await createWorkScheduleBlockService(req.body, req.user);

    return res.status(201).json({
      message: "Gửi yêu cầu nghỉ thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể gửi yêu cầu nghỉ");
  }
};

export const updateWorkScheduleBlock = async (req, res) => {
  try {
    const data = await updateWorkScheduleBlockService(req.params.id, req.body, req.user);

    return res.json({
      message: "Cập nhật yêu cầu nghỉ thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể cập nhật yêu cầu nghỉ");
  }
};

export const deleteWorkScheduleBlock = async (req, res) => {
  try {
    await deleteWorkScheduleBlockService(req.params.id, req.user);

    return res.json({
      message: "Xóa lịch nghỉ thành công",
    });
  } catch (error) {
    return handleError(res, error, "Không thể xóa lịch nghỉ");
  }
};

export const reviewWorkScheduleBlock = async (req, res) => {
  try {
    const data = await reviewWorkScheduleBlockService(req.params.id, req.body, req.user);

    return res.json({
      message: "Cập nhật trạng thái lịch nghỉ thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể cập nhật trạng thái lịch nghỉ");
  }
};
