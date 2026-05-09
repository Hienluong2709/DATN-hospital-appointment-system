import {
  getDashboardSummaryService,
  getPublicDashboardSnapshotService,
} from "../services/dashboardService.js";

const handleError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? fallbackMessage : error.message;

  return res.status(statusCode).json({ message });
};

export const getPublicDashboardSnapshot = async (req, res) => {
  try {
    const data = await getPublicDashboardSnapshotService();

    return res.json({
      message: "Lấy dữ liệu trang chủ công khai thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy dữ liệu trang chủ công khai");
  }
};

export const getDashboardSummary = async (req, res) => {
  try {
    const data = await getDashboardSummaryService(req.user);

    return res.json({
      message: "Lấy dữ liệu tổng quan thành công",
      data,
    });
  } catch (error) {
    return handleError(res, error, "Không thể lấy dữ liệu tổng quan");
  }
};
