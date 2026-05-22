import {
  createUserService,
  deleteUserService,
  getAllUsersService,
  getCurrentUserService,
  getUserByIdService,
  resetUserPasswordService,
  updateUserStatusService,
  updateCurrentUserService,
  updateUserService,
} from "../services/userService.js";

const handleError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? fallbackMessage : error.message;

  return res.status(statusCode).json({ message });
};

export const getAllUsers = async (req, res) => {
  try {
    const { items, pagination } = await getAllUsersService(req.query);

    return res.json({
      message: "Lấy danh sách người dùng thành công",
      data: items,
      ...(pagination ? { pagination } : {}),
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy danh sách người dùng");
  }
};

export const getUserById = async (req, res) => {
  try {
    const data = await getUserByIdService(req.params.id);

    return res.json({
      message: "Lấy chi tiết người dùng thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy chi tiết người dùng");
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const data = await getCurrentUserService(req.user);

    return res.json({
      message: "Lấy hồ sơ người dùng thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy hồ sơ người dùng");
  }
};

export const createUser = async (req, res) => {
  try {
    const data = await createUserService(req.body);

    return res.status(201).json({
      message: "Tạo người dùng thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể tạo người dùng");
  }
};

export const updateUser = async (req, res) => {
  try {
    const data = await updateUserService(req.params.id, req.body);

    return res.json({
      message: "Cập nhật người dùng thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể cập nhật người dùng");
  }
};

export const updateCurrentUser = async (req, res) => {
  try {
    const data = await updateCurrentUserService(req.user, req.body);

    return res.json({
      message: "Cập nhật hồ sơ thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể cập nhật hồ sơ");
  }
};

export const deleteUser = async (req, res) => {
  try {
    await deleteUserService(req.params.id, req.user);

    return res.json({
      message: "Xóa người dùng thành công",
    });
  } catch (error) {
    return handleError(res, error, "Không thể xóa người dùng");
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const data = await updateUserStatusService(req.params.id, req.body, req.user);

    return res.json({
      message: data.status === "Inactive" ? "Khóa tài khoản thành công" : "Mở khóa tài khoản thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể cập nhật trạng thái người dùng");
  }
};

export const resetUserPassword = async (req, res) => {
  try {
    const data = await resetUserPasswordService(req.params.id);

    return res.json({
      message: "Đã gửi mật khẩu tạm thời qua email",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể gửi mật khẩu tạm thời");
  }
};
