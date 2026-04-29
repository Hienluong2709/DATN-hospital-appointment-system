export type RoomStatus = 'Available' | 'Maintenance';

export interface RoomSpecialtyRef {
  id: number;
  name: string;
}

export interface Room {
  id: number;
  name: string;
  floor: number | null;
  specialty_id: number;
  status: RoomStatus;
  description: string | null;
  Specialty?: RoomSpecialtyRef | null;
}

export interface RoomUpsertPayload {
  name: string;
  floor?: number | null;
  specialty_id: number;
  status?: RoomStatus;
  description?: string | null;
}
