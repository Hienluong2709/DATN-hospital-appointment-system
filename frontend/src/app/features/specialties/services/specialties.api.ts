import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { Specialty, SpecialtyUpsertPayload } from '../models/specialties.model';

export interface SpecialtyListFilters {
  q?: string;
  page?: number;
  page_size?: number;
}

@Injectable({ providedIn: 'root' })
export class SpecialtiesApiService {
  constructor(private readonly http: HttpClient) {}

  getAll(filters?: SpecialtyListFilters) {
    let params = new HttpParams();

    if (filters?.q?.trim()) {
      params = params.set('q', filters.q.trim());
    }

    if (typeof filters?.page === 'number' && filters.page > 0) {
      params = params.set('page', String(filters.page));
    }

    if (typeof filters?.page_size === 'number' && filters.page_size > 0) {
      params = params.set('page_size', String(filters.page_size));
    }

    return this.http.get<ApiResponse<Specialty[]>>(`${API_BASE_URL}/specialties`, { params });
  }

  getById(id: number) {
    return this.http.get<ApiResponse<Specialty>>(`${API_BASE_URL}/specialties/${id}`);
  }

  create(payload: SpecialtyUpsertPayload) {
    return this.http.post<ApiResponse<Specialty>>(`${API_BASE_URL}/specialties`, payload);
  }

  update(id: number, payload: SpecialtyUpsertPayload) {
    return this.http.put<ApiResponse<Specialty>>(`${API_BASE_URL}/specialties/${id}`, payload);
  }

  delete(id: number) {
    return this.http.delete<ApiResponse<null>>(`${API_BASE_URL}/specialties/${id}`);
  }
}
