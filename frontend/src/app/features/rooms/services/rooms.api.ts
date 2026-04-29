import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { Room, RoomUpsertPayload } from '../models/rooms.model';

@Injectable({ providedIn: 'root' })
export class RoomsApiService {
  constructor(private readonly http: HttpClient) {}

  getAll() {
    return this.http.get<ApiResponse<Room[]>>(`${API_BASE_URL}/rooms`);
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
