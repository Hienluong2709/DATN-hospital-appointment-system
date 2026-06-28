export type DoctorStatus = 'Active' | 'Inactive';

export interface DoctorUserRef {
  id: number;
  username: string;
  fullname: string | null;
  email: string;
  phone: string | null;
  role: string;
}

export interface DoctorSpecialtyRef {
  id: number;
  name: string;
}

export interface DoctorRoomRef {
  id: number;
  name: string;
  floor: number | null;
  specialty_id: number;
}

export interface DoctorAvailabilityPeriod {
  start_time: string;
  end_time: string;
}

export interface DoctorAvailabilityBlockedPeriod extends DoctorAvailabilityPeriod {
  reason: string | null;
}

export interface DoctorAvailabilityDay {
  date: string;
  day_of_week: number;
  is_off: boolean;
  off_reason: string | null;
  working_periods: DoctorAvailabilityPeriod[];
  blocked_periods: DoctorAvailabilityBlockedPeriod[];
  booked_slots: string[];
  available_slots: string[];
}

export interface DoctorAvailability {
  doctor_id: number;
  start_date: string;
  end_date: string;
  slot_minutes: number;
  days: DoctorAvailabilityDay[];
}

export interface Doctor {
  id: number;
  user_id: number;
  specialty_id: number;
  room_id: number | null;
  description: string | null;
  status: DoctorStatus;
  User?: DoctorUserRef | null;
  Specialty?: DoctorSpecialtyRef | null;
  Room?: DoctorRoomRef | null;
}

export interface DoctorUpsertPayload {
  user_id: number;
  specialty_id: number;
  room_id?: number | null;
  description?: string | null;
  status?: DoctorStatus;
}
