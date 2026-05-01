import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { User, UserUpsertPayload } from '../models/users.model';

@Injectable({ providedIn: 'root' })
export class UsersApiService {
  constructor(private readonly http: HttpClient) {}

  getAll() {
    return this.http.get<ApiResponse<User[]>>(`${API_BASE_URL}/users`);
  }

  getMe() {
    return this.http.get<ApiResponse<User>>(`${API_BASE_URL}/users/me`);
  }

  getById(id: number) {
    return this.http.get<ApiResponse<User>>(`${API_BASE_URL}/users/${id}`);
  }

  create(payload: UserUpsertPayload) {
    return this.http.post<ApiResponse<User>>(`${API_BASE_URL}/users`, payload);
  }

  update(id: number, payload: UserUpsertPayload) {
    return this.http.put<ApiResponse<User>>(`${API_BASE_URL}/users/${id}`, payload);
  }

  updateMe(payload: Pick<UserUpsertPayload, 'fullname' | 'email' | 'phone' | 'date_of_birth' | 'gender' | 'address'>) {
    return this.http.put<ApiResponse<User>>(`${API_BASE_URL}/users/me`, payload);
  }

  delete(id: number) {
    return this.http.delete<ApiResponse<null>>(`${API_BASE_URL}/users/${id}`);
  }
}
