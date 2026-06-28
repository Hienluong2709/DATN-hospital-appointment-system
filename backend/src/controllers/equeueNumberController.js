import {
  createEQueueNumberService,
  deleteEQueueNumberService,
  getAllEQueueNumbersService,
  getEQueueNumberByDateService,
  getEQueueNumberByIdService,
  resetEQueueNumberService,
  updateEQueueNumberService,
} from "../services/equeueNumberService.js";

const handleError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? fallbackMessage : error.message;

  return res.status(statusCode).json({ message });
};

export const getAllEQueueNumbers = async (req, res) => {
  try {
    const data = await getAllEQueueNumbersService();

    return res.json({
      message: "Lấy danh sách bộ đếm số thứ tự thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy danh sách bộ đếm số thứ tự");
  }
};

export const getEQueueNumberById = async (req, res) => {
  try {
    const data = await getEQueueNumberByIdService(req.params.id);

    return res.json({
      message: "Lấy chi tiết bộ đếm số thứ tự thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy chi tiết bộ đếm số thứ tự");
  }
};

export const getEQueueNumberByDate = async (req, res) => {
  try {
    const data = await getEQueueNumberByDateService(req.query.date, req.query.doctor_id);

    return res.json({
      message: "Lấy bộ đếm số thứ tự theo ngày và bác sĩ thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy bộ đếm số thứ tự theo ngày và bác sĩ");
  }
};

export const createEQueueNumber = async (req, res) => {
  try {
    const data = await createEQueueNumberService(req.body);

    return res.status(201).json({
      message: "Tạo bộ đếm số thứ tự thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể tạo bộ đếm số thứ tự");
  }
};

export const updateEQueueNumber = async (req, res) => {
  try {
    const data = await updateEQueueNumberService(req.params.id, req.body);

    return res.json({
      message: "Cập nhật bộ đếm số thứ tự thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể cập nhật bộ đếm số thứ tự");
  }
};

export const deleteEQueueNumber = async (req, res) => {
  try {
    await deleteEQueueNumberService(req.params.id);

    return res.json({
      message: "Xóa bộ đếm số thứ tự thành công",
    });
  } catch (error) {
    return handleError(res, error, "Không thể xóa bộ đếm số thứ tự");
  }
};

export const resetEQueueNumber = async (req, res) => {
  try {
    const data = await resetEQueueNumberService(req.body);

    return res.json({
      message: "Reset bộ đếm số thứ tự thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể reset bộ đếm số thứ tự");
  }
};