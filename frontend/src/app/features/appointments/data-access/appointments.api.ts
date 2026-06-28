import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { Appointment, AppointmentTransitionResult, CreateAppointmentPayload } from '../models/appointments.model';
import { Queue } from '../../queues/models/queues.model';
import { QueuePriorityLevel } from '../../queues/models/queues.model';

export interface AppointmentListFilters {
  q?: string;
  status?: Appointment['status'] | 'ALL';
  doctor_id?: number;
  patient_id?: number;
  specialty_id?: number;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

@Injectable({ providedIn: 'root' })
export class AppointmentsApiService {
  constructor(private readonly http: HttpClient) {}

  getAll(filters?: AppointmentListFilters) {
    let params = new HttpParams();

    if (filters?.q?.trim()) {
      params = params.set('q', filters.q.trim());
    }

    if (filters?.status && filters.status !== 'ALL') {
      params = params.set('status', filters.status);
    }

    if (typeof filters?.doctor_id === 'number' && filters.doctor_id > 0) {
      params = params.set('doctor_id', String(filters.doctor_id));
    }

    if (typeof filters?.patient_id === 'number' && filters.patient_id > 0) {
      params = params.set('patient_id', String(filters.patient_id));
    }

    if (typeof filters?.specialty_id === 'number' && filters.specialty_id > 0) {
      params = params.set('specialty_id', String(filters.specialty_id));
    }

    if (filters?.date_from) {
      params = params.set('date_from', filters.date_from);
    }

    if (filters?.date_to) {
      params = params.set('date_to', filters.date_to);
    }

    if (typeof filters?.page === 'number' && filters.page > 0) {
      params = params.set('page', String(filters.page));
    }

    if (typeof filters?.page_size === 'number' && filters.page_size > 0) {
      params = params.set('page_size', String(filters.page_size));
    }

    return this.http.get<ApiResponse<Appointment[]>>(`${API_BASE_URL}/appointments`, { params });
  }

  create(payload: CreateAppointmentPayload) {
    return this.http.post<ApiResponse<Appointment>>(`${API_BASE_URL}/appointments`, payload);
  }

  cancel(id: number) {
    return this.http.post<ApiResponse<Appointment>>(`${API_BASE_URL}/appointments/${id}/cancel`, {});
  }

  markNoShow(id: number, note?: string | null) {
    return this.http.post<ApiResponse<Appointment>>(`${API_BASE_URL}/appointments/${id}/no-show`, {
      note: note?.trim() || null
    });
  }

  checkIn(id: number, priorityLevel?: QueuePriorityLevel) {
    return this.http.post<ApiResponse<Queue>>(`${API_BASE_URL}/appointments/${id}/check-in`, {
      priority_level: priorityLevel || 'Normal'
    });
  }

  start(id: number) {
    return this.http.post<ApiResponse<AppointmentTransitionResult>>(`${API_BASE_URL}/appointments/${id}/start`, {});
  }

  complete(id: number) {
    return this.http.post<ApiResponse<AppointmentTransitionResult>>(`${API_BASE_URL}/appointments/${id}/completed`, {});
  }
}
