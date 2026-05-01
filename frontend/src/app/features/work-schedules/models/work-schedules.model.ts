export type WorkScheduleDayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WorkScheduleDoctorUserRef {
  id: number;
  fullname: string | null;
  username: string;
  role: string;
}

export interface WorkScheduleDoctorRef {
  id: number;
  user_id: number;
  specialty_id: number;
  room_id: number | null;
  User?: WorkScheduleDoctorUserRef | null;
}

export interface WorkSchedule {
  id: number;
  doctor_id: number;
  day_of_week: WorkScheduleDayOfWeek;
  start_time: string;
  end_time: string;
  Doctor?: WorkScheduleDoctorRef | null;
}

export interface WorkScheduleUpsertPayload {
  doctor_id: number;
  day_of_week: WorkScheduleDayOfWeek;
  start_time: string;
  end_time: string;
}
