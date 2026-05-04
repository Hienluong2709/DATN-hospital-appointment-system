import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { User, UserUpsertPayload } from '../models/users.model';

export interface UserListFilters {
  q?: string;
  role?: User['role'] | 'ALL';
  gender?: NonNullable<User['gender']> | 'ALL';
  page?: number;
  page_size?: number;
}

@Injectable({ providedIn: 'root' })
export class UsersApiService {
  constructor(private readonly http: HttpClient) {}

  getAll(filters?: UserListFilters) {
    let params = new HttpParams();

    if (filters?.q?.trim()) {
      params = params.set('q', filters.q.trim());
    }

    if (filters?.role && filters.role !== 'ALL') {
      params = params.set('role', filters.role);
    }

    if (filters?.gender && filters.gender !== 'ALL') {
      params = params.set('gender', filters.gender);
    }

    if (typeof filters?.page === 'number' && filters.page > 0) {
      params = params.set('page', String(filters.page));
    }

    if (typeof filters?.page_size === 'number' && filters.page_size > 0) {
      params = params.set('page_size', String(filters.page_size));
    }

    return this.http.get<ApiResponse<User[]>>(`${API_BASE_URL}/users`, { params });
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
