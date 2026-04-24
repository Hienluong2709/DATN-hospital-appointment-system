import {
  createWorkScheduleBlockService,
  deleteWorkScheduleBlockService,
  getAllWorkScheduleBlocksService,
  getWorkScheduleBlockByIdService,
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
      message: "Lấy danh sách work schedule block thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy danh sách work schedule block");
  }
};

export const getWorkScheduleBlockById = async (req, res) => {
  try {
    const data = await getWorkScheduleBlockByIdService(req.params.id, undefined, req.user);

    return res.json({
      message: "Lấy chi tiết work schedule block thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy chi tiết work schedule block");
  }
};

export const createWorkScheduleBlock = async (req, res) => {
  try {
    const data = await createWorkScheduleBlockService(req.body, req.user);

    return res.status(201).json({
      message: "Tạo work schedule block thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể tạo work schedule block");
  }
};

export const updateWorkScheduleBlock = async (req, res) => {
  try {
    const data = await updateWorkScheduleBlockService(req.params.id, req.body, req.user);

    return res.json({
      message: "Cập nhật work schedule block thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể cập nhật work schedule block");
  }
};

export const deleteWorkScheduleBlock = async (req, res) => {
  try {
    await deleteWorkScheduleBlockService(req.params.id, req.user);

    return res.json({
      message: "Xóa work schedule block thành công",
    });
  } catch (error) {
    return handleError(res, error, "Không thể xóa work schedule block");
  }
};
