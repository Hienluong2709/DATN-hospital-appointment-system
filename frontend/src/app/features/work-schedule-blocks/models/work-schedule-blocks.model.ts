export interface WorkScheduleBlockDoctorUserRef {
  id: number;
  fullname: string | null;
  username: string;
  role: string;
}

export type WorkScheduleBlockStatus = 'Pending' | 'Approved' | 'Rejected';

export interface WorkScheduleBlockDoctorRef {
  id: number;
  user_id: number;
  specialty_id: number;
  room_id: number | null;
  User?: WorkScheduleBlockDoctorUserRef | null;
}

export interface WorkScheduleBlock {
  id: number;
  doctor_id: number;
  requested_by_user_id: number | null;
  reviewed_by_user_id: number | null;
  date: string;
  status: WorkScheduleBlockStatus;
  is_off: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  Doctor?: WorkScheduleBlockDoctorRef | null;
  requestedBy?: WorkScheduleBlockDoctorUserRef | null;
  reviewedBy?: WorkScheduleBlockDoctorUserRef | null;
  created_at?: string;
  updated_at?: string;
}

export interface WorkScheduleBlockUpsertPayload {
  doctor_id: number;
  date: string;
  is_off: boolean;
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
}

export interface WorkScheduleBlockReviewPayload {
  status: Extract<WorkScheduleBlockStatus, 'Approved' | 'Rejected'>;
  review_note?: string | null;
}
