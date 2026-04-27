const normalizeBaseUrl = (rawUrl: string): string => rawUrl.replace(/\/$/, '');

const defaultApiBaseUrl = '/api';

export const API_BASE_URL = normalizeBaseUrl(
  (globalThis as { __API_BASE_URL__?: string }).__API_BASE_URL__ ?? defaultApiBaseUrl
);
