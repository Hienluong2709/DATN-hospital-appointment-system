import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { Appointment, AppointmentTransitionResult, CreateAppointmentPayload } from '../models/appointments.model';
import { Queue } from '../../queues/models/queues.model';

@Injectable({ providedIn: 'root' })
export class AppointmentsApiService {
  constructor(private readonly http: HttpClient) {}

  getAll() {
    return this.http.get<ApiResponse<Appointment[]>>(`${API_BASE_URL}/appointments`);
  }

  create(payload: CreateAppointmentPayload) {
    return this.http.post<ApiResponse<Appointment>>(`${API_BASE_URL}/appointments`, payload);
  }

  confirm(id: number) {
    return this.http.post<ApiResponse<Appointment>>(`${API_BASE_URL}/appointments/${id}/confirm`, {});
  }

  cancel(id: number) {
    return this.http.post<ApiResponse<Appointment>>(`${API_BASE_URL}/appointments/${id}/cancel`, {});
  }

  checkIn(id: number) {
    return this.http.post<ApiResponse<Queue>>(`${API_BASE_URL}/appointments/${id}/check-in`, {});
  }

  start(id: number) {
    return this.http.post<ApiResponse<AppointmentTransitionResult>>(`${API_BASE_URL}/appointments/${id}/start`, {});
  }

  complete(id: number) {
    return this.http.post<ApiResponse<AppointmentTransitionResult>>(`${API_BASE_URL}/appointments/${id}/completed`, {});
  }
}
