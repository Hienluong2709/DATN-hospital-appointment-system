import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { Specialty, SpecialtyUpsertPayload } from '../models/specialties.model';

@Injectable({ providedIn: 'root' })
export class SpecialtiesApiService {
  constructor(private readonly http: HttpClient) {}

  getAll() {
    return this.http.get<ApiResponse<Specialty[]>>(`${API_BASE_URL}/specialties`);
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
