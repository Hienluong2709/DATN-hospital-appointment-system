import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { Queue } from '../models/queues.model';

@Injectable({ providedIn: 'root' })
export class QueuesApiService {
  constructor(private readonly http: HttpClient) {}

  getAll(filters?: { date?: string; doctor_id?: number; status?: string }) {
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

    return this.http.get<ApiResponse<Queue[]>>(`${API_BASE_URL}/queues`, { params });
  }

  delete(id: number) {
    return this.http.delete<ApiResponse<null>>(`${API_BASE_URL}/queues/${id}`);
  }
}
