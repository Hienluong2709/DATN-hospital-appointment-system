import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { WorkSchedule, WorkScheduleUpsertPayload } from '../models/work-schedules.model';

@Injectable({ providedIn: 'root' })
export class WorkSchedulesApiService {
  constructor(private readonly http: HttpClient) {}

  getAll() {
    return this.http.get<ApiResponse<WorkSchedule[]>>(`${API_BASE_URL}/work-schedules`);
  }

  getById(id: number) {
    return this.http.get<ApiResponse<WorkSchedule>>(`${API_BASE_URL}/work-schedules/${id}`);
  }

  create(payload: WorkScheduleUpsertPayload) {
    return this.http.post<ApiResponse<WorkSchedule>>(`${API_BASE_URL}/work-schedules`, payload);
  }

  update(id: number, payload: WorkScheduleUpsertPayload) {
    return this.http.put<ApiResponse<WorkSchedule>>(`${API_BASE_URL}/work-schedules/${id}`, payload);
  }

  delete(id: number) {
    return this.http.delete<ApiResponse<null>>(`${API_BASE_URL}/work-schedules/${id}`);
  }
}
