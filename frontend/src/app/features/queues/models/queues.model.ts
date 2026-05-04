export type QueueStatus = 'Pending' | 'Confirmed' | 'CheckedIn' | 'Cancelled' | 'Completed' | 'NoShow';

export interface QueuePatientRef {
  id: number;
  fullname: string | null;
  username: string;
  phone: string | null;
  email: string | null;
}

export interface QueueDoctorUserRef {
  id: number;
  fullname: string | null;
  username: string;
  role: string;
}

export interface QueueSpecialtyRef {
  id: number;
  name: string;
}

export interface QueueRoomRef {
  id: number;
  name: string;
  floor: number | null;
}

export interface QueueDoctorRef {
  id: number;
  User?: QueueDoctorUserRef | null;
  Specialty?: QueueSpecialtyRef | null;
  Room?: QueueRoomRef | null;
}

export interface QueueAppointmentRef {
  id: number;
  patient?: QueuePatientRef | null;
  Doctor?: QueueDoctorRef | null;
  time_slot: string | null;
  reason?: string | null;
  status: QueueStatus;
}

export interface QueueWaitPredictionRef {
  id: number;
  predicted_wait_time: number | null;
  predicted_start?: string | null;
  prediction_source?: string | null;
  model_version?: string | null;
  created_at: string | null;
}

export interface Queue {
  id: number;
  appointment_id: number;
  doctor_id: number;
  date: string;
  queue_number: number;
  checked_in_at?: string | null;
  original_estimated_start?: string | null;
  predicted_wait_minutes?: number | null;
  actual_start?: string | null;
  actual_end?: string | null;
  estimated_start?: string | null;
  forecast_updated_at?: string | null;
  latest_prediction_id?: number | null;
  Appointment?: QueueAppointmentRef | null;
  WaitPrediction?: QueueWaitPredictionRef | null;
}
