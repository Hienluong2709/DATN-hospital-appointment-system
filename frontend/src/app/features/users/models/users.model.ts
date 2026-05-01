export type UserRole = 'ADMIN' | 'DOCTOR' | 'PATIENT' | 'RECEPTIONIST';
export type UserGender = 'MALE' | 'FEMALE' | 'OTHER';

export interface User {
  id: number;
  username: string;
  fullname: string;
  email: string | null;
  phone: string | null;
  date_of_birth?: string | null;
  gender?: UserGender | null;
  address?: string | null;
  role: UserRole;
}

export interface UserUpsertPayload {
  username: string;
  password?: string;
  fullname: string;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: UserGender | null;
  address?: string | null;
  role: UserRole;
}
