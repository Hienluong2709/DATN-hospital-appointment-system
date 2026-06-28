import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { Queue } from '../models/queues.model';

export interface QueueListFilters {
  date?: string;
  doctor_id?: number;
  status?: string;
  appointment_id?: number;
  queue_number?: number;
  page?: number;
  page_size?: number;
}

@Injectable({ providedIn: 'root' })
export class QueuesApiService {
  constructor(private readonly http: HttpClient) {}

  getAll(filters?: QueueListFilters) {
    let params = new HttpParams();

    if (filters?.date) {
      params = params.set('date', filters.date);
    }

    if (typeof filters?.doctor_id === 'number' && filters.doctor_id > 0) {
      params = params.set('doctor_id', String(filters.doctor_id));
    }

    if (filters?.status && filters.status !== 'ALL') {
      params = params.set('status', filters.status);
    }

    if (typeof filters?.appointment_id === 'number' && filters.appointment_id > 0) {
      params = params.set('appointment_id', String(filters.appointment_id));
    }

    if (typeof filters?.queue_number === 'number' && filters.queue_number > 0) {
      params = params.set('queue_number', String(filters.queue_number));
    }

    if (typeof filters?.page === 'number' && filters.page > 0) {
      params = params.set('page', String(filters.page));
    }

    if (typeof filters?.page_size === 'number' && filters.page_size > 0) {
      params = params.set('page_size', String(filters.page_size));
    }

    return this.http.get<ApiResponse<Queue[]>>(`${API_BASE_URL}/queues`, { params });
  }

  delete(id: number) {
    return this.http.delete<ApiResponse<null>>(`${API_BASE_URL}/queues/${id}`);
  }
}
