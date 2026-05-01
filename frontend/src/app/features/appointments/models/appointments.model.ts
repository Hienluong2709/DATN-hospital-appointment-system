export type AppointmentStatus = 'Pending' | 'Confirmed' | 'CheckedIn' | 'Cancelled' | 'Completed' | 'NoShow';
export type AppointmentPreferredPeriod = 'MORNING' | 'AFTERNOON';

export interface AppointmentPatientRef {
  id: number;
  fullname: string | null;
  username: string;
  phone: string | null;
  email: string | null;
  role: string;
}

export interface AppointmentDoctorUserRef {
  id: number;
  fullname: string | null;
  username: string;
  role: string;
}

export interface AppointmentDoctorSpecialtyRef {
  id: number;
  name: string;
}

export interface AppointmentDoctorRoomRef {
  id: number;
  name: string;
  floor: number | null;
}

export interface AppointmentDoctorRef {
  id: number;
  User?: AppointmentDoctorUserRef | null;
  Specialty?: AppointmentDoctorSpecialtyRef | null;
  Room?: AppointmentDoctorRoomRef | null;
}

export interface AppointmentQueueRef {
  id?: number;
  queue_number?: number | null;
  checked_in_at?: string | null;
  original_estimated_start?: string | null;
  predicted_wait_minutes?: number | null;
  actual_start?: string | null;
  actual_end?: string | null;
  estimated_start?: string | null;
  forecast_updated_at?: string | null;
  latest_prediction_id?: number | null;
}

export interface Appointment {
  id: number;
  patient_id: number;
  doctor_id: number;
  date: string;
  time_slot: string | null;
  preferred_period?: AppointmentPreferredPeriod | null;
  reason?: string | null;
  status: AppointmentStatus;
  hold_expires_at?: string | null;
  estimated_start?: string | null;
  patient?: AppointmentPatientRef | null;
  Doctor?: AppointmentDoctorRef | null;
  Queue?: AppointmentQueueRef | null;
}

export interface AppointmentTransitionResult {
  appointment: Appointment;
  queue: AppointmentQueueRef;
}

export interface CreateAppointmentPayload {
  doctor_id: number;
  date: string;
  time_slot?: string | null;
  preferred_period?: AppointmentPreferredPeriod | null;
  reason?: string | null;
}

export interface AvailableDoctorSlot {
  doctor_id: number;
  name: string;
  room: string | null;
  available_slots: string[];
  available_slots_count: number;
}
