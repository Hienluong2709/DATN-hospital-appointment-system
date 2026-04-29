import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { Doctor, DoctorAvailability, DoctorUpsertPayload } from '../models/doctors.model';

@Injectable({ providedIn: 'root' })
export class DoctorsApiService {
  constructor(private readonly http: HttpClient) {}

  getAll() {
    return this.http.get<ApiResponse<Doctor[]>>(`${API_BASE_URL}/doctors`);
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
