import { API_BASE_URL } from './constants';
import { getUserToken, getAdminToken, logoutUser, logoutAdmin } from './auth';

interface ApiOptions {
  method?: string;
  body?: unknown;
  isAdmin?: boolean;
  skipAuth?: boolean;
}

export class ApiRequestError extends Error {
  status: number;
  detail: string;
  
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
    this.name = 'ApiRequestError';
  }
}

function buildApiUrl(endpoint: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
}

function normalizeDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        return '';
      })
      .filter(Boolean)
      .join('\n') || '입력 값을 다시 확인해 주세요.';
  }
  if (detail && typeof detail === 'object') {
    return JSON.stringify(detail);
  }
  return '알 수 없는 오류가 발생했습니다.';
}

export async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, isAdmin = false, skipAuth = false } = options;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (!skipAuth) {
    const token = isAdmin ? getAdminToken() : getUserToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  const config: RequestInit = {
    method,
    headers,
  };
  
  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }
  
  const response = await fetch(buildApiUrl(endpoint), config);
  
  if (!response.ok) {
    let detail = '알 수 없는 오류가 발생했습니다.';
    try {
      const errorData = await response.json();
      detail = normalizeDetail(errorData.detail || detail);
    } catch {
      // ignore parse error
    }
    
    // Handle specific status codes
    if (response.status === 401) {
      if (typeof window !== 'undefined' && isAdmin) {
        logoutAdmin();
      } else if (typeof window !== 'undefined') {
        logoutUser();
      }
    }
    
    throw new ApiRequestError(response.status, detail);
  }
  
  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }
  
  return response.json();
}

// Convenience methods
export const apiGet = <T>(endpoint: string, isAdmin = false) => 
  api<T>(endpoint, { isAdmin });

export const apiPost = <T>(endpoint: string, body?: unknown, isAdmin = false) => 
  api<T>(endpoint, { method: 'POST', body, isAdmin });

export const apiPatch = <T>(endpoint: string, body?: unknown, isAdmin = false) => 
  api<T>(endpoint, { method: 'PATCH', body, isAdmin });

export const apiPut = <T>(endpoint: string, body?: unknown, isAdmin = false) => 
  api<T>(endpoint, { method: 'PUT', body, isAdmin });

export const apiDelete = <T>(endpoint: string, isAdmin = false) => 
  api<T>(endpoint, { method: 'DELETE', isAdmin });

export const apiPublicGet = <T>(endpoint: string) =>
  api<T>(endpoint, { skipAuth: true });

// Error message helper
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    switch (error.status) {
      case 403: return '접근 권한이 없습니다.';
      case 409: return '이미 처리된 요청입니다.';
      case 422: return error.detail;
      default: return error.detail;
    }
  }
  if (error instanceof Error) return error.message;
  return '오류가 발생했습니다.';
}
