const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  RECEPTIONIST: 'Lễ tân',
  DOCTOR: 'Bác sĩ',
  PATIENT: 'Bệnh nhân',
};

const GENDER_LABELS: Record<string, string> = {
  MALE: 'Nam',
  FEMALE: 'Nữ',
  OTHER: 'Khác',
};

const DOCTOR_STATUS_LABELS: Record<string, string> = {
  Active: 'Đang hoạt động',
  Inactive: 'Tạm ngưng',
};

const ROOM_STATUS_LABELS: Record<string, string> = {
  Available: 'Sẵn sàng',
  Maintenance: 'Bảo trì',
};

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  Pending: 'Chờ xác nhận',
  Confirmed: 'Đã xác nhận',
  CheckedIn: 'Đã check-in',
  Cancelled: 'Đã hủy',
  Completed: 'Hoàn tất',
  NoShow: 'Vắng khám',
};

const USER_STATUS_LABELS: Record<string, string> = {
  Active: 'Đang hoạt động',
  Inactive: 'Đã khóa',
};

const WORK_SCHEDULE_BLOCK_STATUS_LABELS: Record<string, string> = {
  Pending: 'Chờ duyệt',
  Approved: 'Đã duyệt',
  Rejected: 'Từ chối',
};

export function getRoleLabel(role: string | null | undefined): string {
  if (!role) {
    return '--';
  }

  return ROLE_LABELS[role] ?? role;
}

export function getGenderLabel(gender: string | null | undefined): string {
  if (!gender) {
    return '--';
  }

  return GENDER_LABELS[gender] ?? gender;
}

export function getDoctorStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '--';
  }

  return DOCTOR_STATUS_LABELS[status] ?? status;
}

export function getRoomStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '--';
  }

  return ROOM_STATUS_LABELS[status] ?? status;
}

export function getAppointmentStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '--';
  }

  return APPOINTMENT_STATUS_LABELS[status] ?? status;
}

export function getUserStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '--';
  }

  return USER_STATUS_LABELS[status] ?? status;
}

export function getWorkScheduleBlockStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '--';
  }

  return WORK_SCHEDULE_BLOCK_STATUS_LABELS[status] ?? status;
}
