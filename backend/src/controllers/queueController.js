import {
  deleteQueueService,
  getAllQueuesService,
  getQueueByIdService,
} from "../services/queueService.js";

const handleError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? fallbackMessage : error.message;

  return res.status(statusCode).json({ message });
};

export const getAllQueues = async (req, res) => {
  try {
    const { items, pagination } = await getAllQueuesService(req.user, req.query);

    return res.json({
      message: "Lấy danh sách số thứ tự thành công",
      data: items,
      ...(pagination ? { pagination } : {}),
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy danh sách số thứ tự");
  }
};

export const getQueueById = async (req, res) => {
  try {
    const data = await getQueueByIdService(req.params.id, req.user);

    return res.json({
      message: "Lấy chi tiết số thứ tự thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy chi tiết số thứ tự");
  }
};

export const deleteQueue = async (req, res) => {
  try {
    await deleteQueueService(req.params.id, req.user);

    return res.json({
      message: "Hủy check-in thành công",
    });
  } catch (error) {
    return handleError(res, error, "Không thể hủy check-in");
  }
};
