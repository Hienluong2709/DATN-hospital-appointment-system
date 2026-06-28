import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import { EQueueNumber } from '../models/equeue-numbers.model';

@Injectable({ providedIn: 'root' })
export class EQueueNumbersApiService {
  constructor(private readonly http: HttpClient) {}

  getAll() {
    return this.http.get<ApiResponse<EQueueNumber[]>>(`${API_BASE_URL}/equeue-numbers`);
  }
}
