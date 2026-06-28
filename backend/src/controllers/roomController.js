import {
  createRoomService,
  deleteRoomService,
  getAllRoomsService,
  getRoomByIdService,
  updateRoomService,
} from "../services/roomService.js";

const handleError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? fallbackMessage : error.message;

  return res.status(statusCode).json({ message });
};

export const getAllRooms = async (req, res) => {
  try {
    const { items, pagination } = await getAllRoomsService(req.query);

    return res.json({
      message: "Lấy danh sách phòng thành công",
      data: items,
      ...(pagination ? { pagination } : {}),
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy danh sách phòng");
  }
};

export const getRoomById = async (req, res) => {
  try {
    const data = await getRoomByIdService(req.params.id);

    return res.json({
      message: "Lấy chi tiết phòng thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy chi tiết phòng");
  }
};

export const createRoom = async (req, res) => {
  try {
    const data = await createRoomService(req.body);

    return res.status(201).json({
      message: "Tạo phòng thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể tạo phòng");
  }
};

export const updateRoom = async (req, res) => {
  try {
    const data = await updateRoomService(req.params.id, req.body);

    return res.json({
      message: "Cập nhật phòng thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể cập nhật phòng");
  }
};

export const deleteRoom = async (req, res) => {
  try {
    await deleteRoomService(req.params.id);

    return res.json({
      message: "Xóa phòng thành công",
    });
  } catch (error) {
    return handleError(res, error, "Không thể xóa phòng");
  }
};
