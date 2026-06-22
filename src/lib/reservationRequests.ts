import { apiGatewayPost, apiGet } from './api';
import type { ReservationRequestStatus, WaitingRoomResponse } from './types';

const PROCESSING_STATUSES = new Set(['pending', 'enqueued', 'processing']);
const TERMINAL_FAILURE_STATUSES = new Set(['failed', 'enqueue_failed']);

export function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function compactSignature(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function getAttemptKey(namespace: string, signature: string) {
  const storageKey = `reservation-io:${namespace}:${compactSignature(signature)}`;
  if (typeof window === 'undefined') return { idempotencyKey: createIdempotencyKey(), storageKey: '' };

  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return { idempotencyKey: existing, storageKey };

  const idempotencyKey = createIdempotencyKey();
  window.sessionStorage.setItem(storageKey, idempotencyKey);
  return { idempotencyKey, storageKey };
}

export function clearAttemptKey(storageKey: string) {
  if (typeof window !== 'undefined' && storageKey) {
    window.sessionStorage.removeItem(storageKey);
  }
}

export function isWaitingRoomResponse(value: unknown): value is WaitingRoomResponse {
  return Boolean(value && typeof value === 'object' && 'waiting_room' in value);
}

export function isReservationRequestStatus(value: unknown): value is ReservationRequestStatus {
  return Boolean(value && typeof value === 'object' && 'request_uuid' in value && 'status' in value);
}

export function isRequestProcessing(status: ReservationRequestStatus['status']) {
  return PROCESSING_STATUSES.has(status);
}

export function isRequestFailure(status: ReservationRequestStatus['status']) {
  return TERMINAL_FAILURE_STATUSES.has(status);
}

export function requestProgressMessage(status: ReservationRequestStatus) {
  const actionLabel =
    status.action === 'update' ? '예약 수정' : status.action === 'cancel' ? '예약 취소' : '예약';

  if (status.status === 'enqueued') return `${actionLabel} 요청이 대기열에 들어갔습니다.`;
  if (status.status === 'processing') return `${actionLabel} 요청을 처리하고 있습니다.`;
  if (status.status === 'pending') return `${actionLabel} 요청을 접수했습니다.`;
  if (status.status === 'success') return `${actionLabel}이 확정되었습니다.`;
  return status.error_message || `${actionLabel} 요청을 처리하지 못했습니다.`;
}

export function waitingRoomMessage(response: WaitingRoomResponse) {
  const positionText = response.position ? ` 현재 대기 순번은 ${response.position.toLocaleString('ko-KR')}번입니다.` : '';
  const aheadText =
    typeof response.ahead_count === 'number'
      ? ` 앞에 약 ${response.ahead_count.toLocaleString('ko-KR')}명이 있습니다.`
      : '';
  return `${response.message || '예약 요청이 몰려 잠시 대기 중입니다.'}${positionText}${aheadText}`;
}

export async function releaseWaitingRoom(saleDate?: string) {
  if (!saleDate) return;
  await apiGatewayPost<{ released: boolean }>('/waiting-room/release', { sale_date: saleDate }).catch(() => undefined);
}

export async function waitForReservationRequest(
  initialStatus: ReservationRequestStatus,
  onProgress?: (status: ReservationRequestStatus) => void,
  fallbackSaleDate?: string,
) {
  let current = initialStatus;
  onProgress?.(current);

  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (!isRequestProcessing(current.status)) {
      await releaseWaitingRoom(current.sale_date || fallbackSaleDate);
      return current;
    }

    const intervalMs = attempt < 5 ? 1500 : 3000;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    current = await apiGet<ReservationRequestStatus>(`/reservation-requests/${current.request_uuid}`);
    onProgress?.(current);
  }

  await releaseWaitingRoom(current.sale_date || fallbackSaleDate);
  throw new Error('예약 처리 결과 확인 시간이 초과되었습니다. 잠시 후 내 예약에서 상태를 확인해 주세요.');
}
