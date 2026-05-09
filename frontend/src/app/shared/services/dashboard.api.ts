import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { API_BASE_URL } from '../../core/config/api.config';
import { ApiResponse } from '../types/api-response.type';
import { DashboardSummary, PublicDashboardSnapshot } from '../types/dashboard.type';

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  constructor(private readonly http: HttpClient) {}

  getPublicSnapshot() {
    return this.http.get<ApiResponse<PublicDashboardSnapshot>>(`${API_BASE_URL}/dashboard/public`);
  }

  getSummary() {
    return this.http.get<ApiResponse<DashboardSummary>>(`${API_BASE_URL}/dashboard/summary`);
  }
}
