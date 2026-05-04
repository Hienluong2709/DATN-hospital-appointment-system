import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { Room, RoomUpsertPayload } from '../models/rooms.model';

export interface RoomListFilters {
  q?: string;
  status?: Room['status'] | 'ALL';
  specialty_id?: number;
  floor?: number;
  page?: number;
  page_size?: number;
}

@Injectable({ providedIn: 'root' })
export class RoomsApiService {
  constructor(private readonly http: HttpClient) {}

  getAll(filters?: RoomListFilters) {
    let params = new HttpParams();

    if (filters?.q?.trim()) {
      params = params.set('q', filters.q.trim());
    }

    if (filters?.status && filters.status !== 'ALL') {
      params = params.set('status', filters.status);
    }

    if (typeof filters?.specialty_id === 'number' && filters.specialty_id > 0) {
      params = params.set('specialty_id', String(filters.specialty_id));
    }

    if (typeof filters?.floor === 'number' && Number.isInteger(filters.floor) && filters.floor >= 0) {
      params = params.set('floor', String(filters.floor));
    }

    if (typeof filters?.page === 'number' && filters.page > 0) {
      params = params.set('page', String(filters.page));
    }

    if (typeof filters?.page_size === 'number' && filters.page_size > 0) {
      params = params.set('page_size', String(filters.page_size));
    }

    return this.http.get<ApiResponse<Room[]>>(`${API_BASE_URL}/rooms`, { params });
  }

  getById(id: number) {
    return this.http.get<ApiResponse<Room>>(`${API_BASE_URL}/rooms/${id}`);
  }

  create(payload: RoomUpsertPayload) {
    return this.http.post<ApiResponse<Room>>(`${API_BASE_URL}/rooms`, payload);
  }

  update(id: number, payload: RoomUpsertPayload) {
    return this.http.put<ApiResponse<Room>>(`${API_BASE_URL}/rooms/${id}`, payload);
  }

  delete(id: number) {
    return this.http.delete<ApiResponse<null>>(`${API_BASE_URL}/rooms/${id}`);
  }
}
