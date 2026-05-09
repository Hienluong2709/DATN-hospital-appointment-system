import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import {
  WorkScheduleBlock,
  WorkScheduleBlockReviewPayload,
  WorkScheduleBlockUpsertPayload
} from '../models/work-schedule-blocks.model';

@Injectable({ providedIn: 'root' })
export class WorkScheduleBlocksApiService {
  constructor(private readonly http: HttpClient) {}

  getAll() {
    return this.http.get<ApiResponse<WorkScheduleBlock[]>>(`${API_BASE_URL}/work-schedule-blocks`);
  }

  getById(id: number) {
    return this.http.get<ApiResponse<WorkScheduleBlock>>(`${API_BASE_URL}/work-schedule-blocks/${id}`);
  }

  create(payload: WorkScheduleBlockUpsertPayload) {
    return this.http.post<ApiResponse<WorkScheduleBlock>>(`${API_BASE_URL}/work-schedule-blocks`, payload);
  }

  update(id: number, payload: WorkScheduleBlockUpsertPayload) {
    return this.http.put<ApiResponse<WorkScheduleBlock>>(`${API_BASE_URL}/work-schedule-blocks/${id}`, payload);
  }

  review(id: number, payload: WorkScheduleBlockReviewPayload) {
    return this.http.patch<ApiResponse<WorkScheduleBlock>>(`${API_BASE_URL}/work-schedule-blocks/${id}/review`, payload);
  }

  delete(id: number) {
    return this.http.delete<ApiResponse<null>>(`${API_BASE_URL}/work-schedule-blocks/${id}`);
  }
}
