export interface DashboardStatCard {
  key: string;
  label: string;
  value: number | string;
  note?: string;
  tone?: 'primary' | 'success' | 'warning' | 'neutral';
}

export interface DashboardDoctorItem {
  id: number;
  name: string;
  specialty: string | null;
  room: string | null;
  status?: string | null;
  appointment_count?: number;
  description?: string | null;
}

export interface DashboardAppointmentStatusItem {
  status: string;
  total: number;
}

export interface DashboardAppointmentItem {
  id: number;
  date: string;
  time_slot: string | null;
  status: string;
  doctor_name?: string;
  specialty_name?: string | null;
  room_name?: string | null;
  patient_name?: string;
}

export interface DashboardQueueItem {
  id: number;
  appointment_id?: number | null;
  queue_number: number | null;
  predicted_wait_minutes: number | null;
  remaining_wait_minutes?: number | null;
  estimated_start: string | null;
  checked_in_at: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  patient_name: string;
  doctor_name?: string;
  specialty_name?: string | null;
}

export interface PublicDashboardSnapshot {
  generated_at: string;
  stats: DashboardStatCard[];
  featured_doctors: DashboardDoctorItem[];
  featured_specialties: Array<{
    id: number;
    name: string;
    description: string | null;
  }>;
}

export interface AdminDashboardSummary {
  role: 'ADMIN';
  generated_at: string;
  kpis: DashboardStatCard[];
  appointment_statuses: DashboardAppointmentStatusItem[];
  top_doctors_today: DashboardDoctorItem[];
}

export interface ReceptionistDashboardSummary {
  role: 'RECEPTIONIST';
  generated_at: string;
  kpis: DashboardStatCard[];
  next_appointments: DashboardAppointmentItem[];
  waiting_queues: DashboardQueueItem[];
}

export interface DoctorDashboardSummary {
  role: 'DOCTOR';
  generated_at: string;
  doctor: DashboardDoctorItem | null;
  kpis: DashboardStatCard[];
  next_patients: Array<{
    id: number;
    date: string;
    time_slot: string | null;
    status: string;
    patient_name: string;
  }>;
  active_queues: DashboardQueueItem[];
  schedules_today: Array<{
    id: number;
    doctor_id: number;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }>;
  blocks_today: Array<{
    id: number;
    date: string;
    is_off: boolean;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
  }>;
}

export interface PatientDashboardSummary {
  role: 'PATIENT';
  generated_at: string;
  kpis: DashboardStatCard[];
  next_appointments: DashboardAppointmentItem[];
  recent_visits: DashboardAppointmentItem[];
}

export type DashboardSummary =
  | AdminDashboardSummary
  | ReceptionistDashboardSummary
  | DoctorDashboardSummary
  | PatientDashboardSummary;
