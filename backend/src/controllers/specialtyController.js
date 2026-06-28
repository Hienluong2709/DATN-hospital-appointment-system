import {
  createSpecialtyService,
  deleteSpecialtyService,
  getAllSpecialtiesService,
  getSpecialtyByIdService,
  updateSpecialtyService,
} from "../services/specialtyService.js";

const handleError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? fallbackMessage : error.message;

  return res.status(statusCode).json({ message });
};

export const getAllSpecialties = async (req, res) => {
  try {
    const { items, pagination } = await getAllSpecialtiesService(req.query);

    return res.json({
      message: "Lấy danh sách chuyên khoa thành công",
      data: items,
      ...(pagination ? { pagination } : {}),
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy danh sách chuyên khoa");
  }
};

export const getSpecialtyById = async (req, res) => {
  try {
    const data = await getSpecialtyByIdService(req.params.id);

    return res.json({
      message: "Lấy chi tiết chuyên khoa thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy chi tiết chuyên khoa");
  }
};

export const createSpecialty = async (req, res) => {
  try {
    const data = await createSpecialtyService(req.body);

    return res.status(201).json({
      message: "Tạo chuyên khoa thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể tạo chuyên khoa");
  }
};

export const updateSpecialty = async (req, res) => {
  try {
    const data = await updateSpecialtyService(req.params.id, req.body);

    return res.json({
      message: "Cập nhật chuyên khoa thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể cập nhật chuyên khoa");
  }
};

export const deleteSpecialty = async (req, res) => {
  try {
    await deleteSpecialtyService(req.params.id);

    return res.json({
      message: "Xóa chuyên khoa thành công",
    });
  } catch (error) {
    return handleError(res, error, "Không thể xóa chuyên khoa");
  }
};
