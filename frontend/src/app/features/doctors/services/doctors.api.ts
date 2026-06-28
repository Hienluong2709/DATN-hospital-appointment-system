import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { Doctor, DoctorAvailability, DoctorUpsertPayload } from '../models/doctors.model';

export interface DoctorListFilters {
  q?: string;
  status?: Doctor['status'] | 'ALL';
  specialty_id?: number;
  room_id?: number;
  user_id?: number;
  page?: number;
  page_size?: number;
}

@Injectable({ providedIn: 'root' })
export class DoctorsApiService {
  constructor(private readonly http: HttpClient) {}

  getAll(filters?: DoctorListFilters) {
    let params = new HttpParams();

    if (filters?.q?.trim()) {
      params = params.set('q', filters.q.trim());
    }

    if (filters?.status && filters.status !== 'ALL') {
      params = params.set('status', filters.status);
    }

    if (typeof filters?.specialty_id === 'number' && filters.specialty_id > 0) {
      params = params.set('specialty_id', String(filters.specialty_id));
    }

    if (typeof filters?.room_id === 'number' && filters.room_id > 0) {
      params = params.set('room_id', String(filters.room_id));
    }

    if (typeof filters?.user_id === 'number' && filters.user_id > 0) {
      params = params.set('user_id', String(filters.user_id));
    }

    if (typeof filters?.page === 'number' && filters.page > 0) {
      params = params.set('page', String(filters.page));
    }

    if (typeof filters?.page_size === 'number' && filters.page_size > 0) {
      params = params.set('page_size', String(filters.page_size));
    }

    return this.http.get<ApiResponse<Doctor[]>>(`${API_BASE_URL}/doctors`, { params });
  }

  getById(id: number) {
    return this.http.get<ApiResponse<Doctor>>(`${API_BASE_URL}/doctors/${id}`);
  }

  getAvailability(doctorId: number, startDate: string, endDate: string, slotMinutes = 30) {
    const params = new HttpParams()
      .set('start_date', startDate)
      .set('end_date', endDate)
      .set('slot_minutes', String(slotMinutes));

    return this.http.get<ApiResponse<DoctorAvailability>>(
      `${API_BASE_URL}/appointments/doctor/${doctorId}/availability`,
      { params }
    );
  }

  getBySpecialtyAndDate(specialtyId: number, date: string, slotMinutes = 30) {
    const params = new HttpParams()
      .set('specialty_id', String(specialtyId))
      .set('date', date)
      .set('slot_minutes', String(slotMinutes));

    return this.http.get<ApiResponse<Array<{
      doctor_id: number;
      name: string;
      room: string | null;
      available_slots: string[];
      available_slots_count: number;
    }>>>(`${API_BASE_URL}/doctors/by-specialty-date`, { params });
  }

  create(payload: DoctorUpsertPayload) {
    return this.http.post<ApiResponse<Doctor>>(`${API_BASE_URL}/doctors`, payload);
  }

  update(id: number, payload: DoctorUpsertPayload) {
    return this.http.put<ApiResponse<Doctor>>(`${API_BASE_URL}/doctors/${id}`, payload);
  }

  delete(id: number) {
    return this.http.delete<ApiResponse<null>>(`${API_BASE_URL}/doctors/${id}`);
  }
}
