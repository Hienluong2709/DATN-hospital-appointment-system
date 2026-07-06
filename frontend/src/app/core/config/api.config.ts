const normalizeBaseUrl = (rawUrl: string): string => rawUrl.replace(/\/$/, '');

const getDefaultApiBaseUrl = (): string => {
  const fallbackBaseUrl = 'http://localhost:5001/api';

  if (typeof window === 'undefined') {
    return fallbackBaseUrl;
  }

  const hostname = window.location.hostname;
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
    return fallbackBaseUrl;
  }

  return `${window.location.protocol}//${hostname}:5001/api`;
};

export const API_BASE_URL = normalizeBaseUrl(
  (globalThis as { __API_BASE_URL__?: string }).__API_BASE_URL__ ?? getDefaultApiBaseUrl()
);
