import { API_BASE_URL } from './constants';
import { getUserToken, getAdminToken, logoutUser, logoutAdmin } from './auth';

interface ApiOptions {
  method?: string;
  body?: unknown;
  isAdmin?: boolean;
  skipAuth?: boolean;
  headers?: Record<string, string>;
  useGateway?: boolean;
  responseType?: 'json' | 'text';
}

export class ApiRequestError extends Error {
  status: number;
  detail: string;
  code?: string;
  rawDetail?: unknown;
  
  constructor(status: number, detail: string, code?: string, rawDetail?: unknown) {
    super(detail);
    this.status = status;
    this.detail = detail;
    this.code = code;
    this.rawDetail = rawDetail;
    this.name = 'ApiRequestError';
  }
}

const REQUEST_COOLDOWN_MS = 450;
const MUTATION_COOLDOWN_MS = 650;
const inFlightRequests = new Set<string>();
const requestCooldowns = new Map<string, number>();

function buildApiUrl(endpoint: string, useGateway = false): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (useGateway) return `/api${path}`;
  return `${base}${path}`;
}

function assertApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new ApiRequestError(
      0,
      'API 서버 주소가 설정되지 않았습니다. Vercel 환경변수 NEXT_PUBLIC_API_BASE_URL을 확인해 주세요.',
    );
  }
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
    if ('message' in detail) {
      return String((detail as { message: unknown }).message);
    }
    if ('detail' in detail) {
      return normalizeDetail((detail as { detail: unknown }).detail);
    }
    return JSON.stringify(detail);
  }
  return '알 수 없는 오류가 발생했습니다.';
}

function detailCode(detail: unknown): string | undefined {
  if (!detail || typeof detail !== 'object' || !('code' in detail)) return undefined;
  return String((detail as { code: unknown }).code);
}

function requestKey(endpoint: string, method: string, isAdmin: boolean, body: unknown) {
  return `${isAdmin ? 'admin' : 'user'}:${method}:${endpoint}:${body ? JSON.stringify(body) : ''}`;
}

function guardRepeatedRequest(key: string, method: string) {
  if (method === 'GET') return;
  const now = Date.now();
  const cooldownUntil = requestCooldowns.get(key) || 0;
  if (inFlightRequests.has(key) || cooldownUntil > now) {
    throw new ApiRequestError(0, '요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.');
  }
  inFlightRequests.add(key);
  requestCooldowns.set(key, now + (method === 'GET' ? REQUEST_COOLDOWN_MS : MUTATION_COOLDOWN_MS));
}

function releaseRequest(key: string) {
  inFlightRequests.delete(key);
}

export async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    isAdmin = false,
    skipAuth = false,
    headers: customHeaders,
    useGateway = false,
    responseType = 'json',
  } = options;
  assertApiBaseUrl();
  const key = requestKey(endpoint, method, isAdmin, body);
  guardRepeatedRequest(key, method);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (!skipAuth) {
    const token = isAdmin ? getAdminToken() : getUserToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  if (customHeaders) {
    Object.entries(customHeaders).forEach(([name, value]) => {
      headers[name] = value;
    });
  }
  
  const config: RequestInit = {
    method,
    headers,
  };
  
  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }
  
  let response: Response;
  try {
    response = await fetch(buildApiUrl(endpoint, useGateway), config);
  } catch (error) {
    throw new ApiRequestError(
      0,
      error instanceof TypeError
        ? 'API 서버와 통신할 수 없습니다. 백엔드 CORS 허용 Origin에 현재 Vercel 도메인이 포함되어 있는지 확인해 주세요.'
        : 'API 서버와 통신할 수 없습니다.',
    );
  } finally {
    releaseRequest(key);
  }
  
  if (!response.ok) {
    let detail = '알 수 없는 오류가 발생했습니다.';
    let code: string | undefined;
    let rawDetail: unknown;
    try {
      const errorData = await response.json();
      rawDetail = errorData.detail || detail;
      code = detailCode(rawDetail);
      detail = normalizeDetail(rawDetail);
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
    
    throw new ApiRequestError(response.status, detail, code, rawDetail);
  }
  
  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  if (responseType === 'text') {
    return response.text() as Promise<T>;
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

export const apiPublicText = (endpoint: string) =>
  api<string>(endpoint, { skipAuth: true, responseType: 'text' });

export const apiGatewayPost = <T>(endpoint: string, body?: unknown, isAdmin = false) =>
  api<T>(endpoint, { method: 'POST', body, isAdmin, useGateway: true });

export const apiGatewayPatch = <T>(endpoint: string, body?: unknown) =>
  api<T>(endpoint, { method: 'PATCH', body, useGateway: true });

export const apiGatewayDelete = <T>(endpoint: string, headers?: Record<string, string>) =>
  api<T>(endpoint, { method: 'DELETE', headers, useGateway: true });

// Error message helper
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    switch (error.status) {
      case 0: return error.detail;
      case 403: return error.detail || '접근 권한이 없습니다.';
      case 409: return error.detail || '이미 처리 대기 중인 예약 요청이 있습니다. 처리가 끝난 뒤 다시 시도해 주세요.';
      case 429: return error.detail || '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
      case 422: return error.detail;
      default: return error.detail;
    }
  }
  if (error instanceof Error) return error.message;
  return '오류가 발생했습니다.';
}
