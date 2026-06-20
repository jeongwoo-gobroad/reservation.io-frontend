const USER_TOKEN_KEY = 'reservatio_user_token';
const ADMIN_TOKEN_KEY = 'reservatio_admin_token';
const USER_INFO_KEY = 'reservatio_user_info';

export interface UserInfo {
  user_uuid: string;
  kakao_id: string;
  nickname: string;
}

// User token
export function getUserToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USER_TOKEN_KEY);
}

export function setUserToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_TOKEN_KEY, token);
}

export function removeUserToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_TOKEN_KEY);
  localStorage.removeItem(USER_INFO_KEY);
}

export function isUserLoggedIn(): boolean {
  return !!getUserToken();
}

// User info
export function getUserInfo(): UserInfo | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_INFO_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setUserInfo(info: UserInfo): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_INFO_KEY, JSON.stringify(info));
}

// Admin token
export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function removeAdminToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function isAdminLoggedIn(): boolean {
  return !!getAdminToken();
}

// Logout
export function logoutUser(): void {
  removeUserToken();
  if (typeof window !== 'undefined') window.location.href = '/';
}

export function logoutAdmin(): void {
  removeAdminToken();
  if (typeof window !== 'undefined') window.location.href = '/admin/login';
}
