import {
  createDoctorService,
  deleteDoctorService,
  getAllDoctorsService,
  getDoctorsBySpecialtyAndDateService,
  getDoctorByIdService,
  updateDoctorService,
} from "../services/doctorService.js";

const handleError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? fallbackMessage : error.message;

  return res.status(statusCode).json({ message });
};

export const getAllDoctors = async (req, res) => {
  try {
    const data = await getAllDoctorsService();

    return res.json({
      message: "Lấy danh sách bác sĩ thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy danh sách bác sĩ");
  }
};

export const getDoctorById = async (req, res) => {
  try {
    const data = await getDoctorByIdService(req.params.id);

    return res.json({
      message: "Lấy chi tiết bác sĩ thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy chi tiết bác sĩ");
  }
};

export const getDoctorsBySpecialtyAndDate = async (req, res) => {
  try {
    const data = await getDoctorsBySpecialtyAndDateService(req.query, req.user);

    return res.json({
      message: "Lấy danh sách bác sĩ theo chuyên khoa và ngày thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy danh sách bác sĩ theo chuyên khoa và ngày");
  }
};

export const createDoctor = async (req, res) => {
  try {
    const data = await createDoctorService(req.body);

    return res.status(201).json({
      message: "Tạo bác sĩ thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể tạo bác sĩ");
  }
};

export const updateDoctor = async (req, res) => {
  try {
    const data = await updateDoctorService(req.params.id, req.body);

    return res.json({
      message: "Cập nhật bác sĩ thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể cập nhật bác sĩ");
  }
};

export const deleteDoctor = async (req, res) => {
  try {
    await deleteDoctorService(req.params.id);

    return res.json({
      message: "Xóa bác sĩ thành công",
    });
  } catch (error) {
    return handleError(res, error, "Không thể xóa bác sĩ");
  }
};
