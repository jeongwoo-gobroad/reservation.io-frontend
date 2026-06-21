'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarX, Pencil, RefreshCw, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiGatewayDelete, apiGatewayPatch, apiGet, getErrorMessage } from '@/lib/api';
import { formatDateTime, formatSaleDate, reservationKey } from '@/lib/format';
import { isUserLoggedIn } from '@/lib/auth';
import {
  clearAttemptKey,
  getAttemptKey,
  isReservationRequestStatus,
  isRequestFailure,
  isWaitingRoomResponse,
  requestProgressMessage,
  waitForReservationRequest,
  waitingRoomMessage,
} from '@/lib/reservationRequests';
import type { ReservationItem, ReservationRequestStatus, Schedule, UserReservation, WaitingRoomResponse } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import WaitingRoomModal from '@/components/common/WaitingRoomModal';

function reservationItems(reservation: UserReservation): ReservationItem[] {
  if (reservation.items?.length) return reservation.items;
  return [
    {
      schedule_title: reservation.schedule_title,
      schedule_set_uuid: reservation.schedule_set_uuid,
      product_uuid: reservation.product_uuid,
      product_name: reservation.product_name,
      group_name: reservation.group_name,
      quantity: reservation.quantity,
      time_slot_uuid: reservation.time_slot_uuid,
      time_slot_label: reservation.time_slot_label,
    },
  ].filter((item) => item.product_name || item.schedule_title);
}

function reservationScheduleUuid(reservation: UserReservation) {
  return reservation.schedule_set_uuid || reservationItems(reservation).find((item) => item.schedule_set_uuid)?.schedule_set_uuid || '';
}

function reservationProductUuid(reservation: UserReservation) {
  return reservation.product_uuid || reservationItems(reservation).find((item) => item.product_uuid)?.product_uuid || '';
}

function reservationTimeSlotUuid(reservation: UserReservation) {
  return reservation.time_slot_uuid || reservationItems(reservation).find((item) => item.time_slot_uuid)?.time_slot_uuid || '';
}

function reservationQuantity(reservation: UserReservation) {
  return reservation.quantity || reservationItems(reservation)[0]?.quantity || 1;
}

function canEditReservation(reservation: UserReservation) {
  return !reservation.status || reservation.status === 'reserved';
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ReservationsPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<UserReservation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<UserReservation | null>(null);
  const [editTarget, setEditTarget] = useState<UserReservation | null>(null);
  const [editForm, setEditForm] = useState({ quantity: 1, time_slot_uuid: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [requestProgress, setRequestProgress] = useState('');
  const [waitingRoom, setWaitingRoom] = useState<WaitingRoomResponse | null>(null);
  const [waitingRoomAction, setWaitingRoomAction] = useState('예약');

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const [reservationData, scheduleData] = await Promise.all([
        apiGet<UserReservation[]>('/users/me/reservations'),
        apiGet<Schedule[]>('/schedules/open').catch(() => []),
      ]);
      setReservations(reservationData);
      setSchedules(scheduleData);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isUserLoggedIn()) {
      router.replace('/');
      return;
    }
    void Promise.resolve().then(fetchReservations);
  }, [fetchReservations, router]);

  const grouped = useMemo(() => {
    return reservations.reduce<Record<string, UserReservation[]>>((acc, reservation) => {
      const date = reservation.sale_date || '날짜 미정';
      if (!acc[date]) acc[date] = [];
      acc[date].push(reservation);
      return acc;
    }, {});
  }, [reservations]);

  const resolveMutationResponse = useCallback(
    async (
      initialResponse: ReservationRequestStatus | WaitingRoomResponse,
      retry: () => Promise<ReservationRequestStatus | WaitingRoomResponse>,
    ) => {
      let response = initialResponse;
      for (let attempt = 0; isWaitingRoomResponse(response) && attempt < 40; attempt += 1) {
        setWaitingRoom(response);
        setRequestProgress(waitingRoomMessage(response));
        await delay(Math.max(1, response.retry_after_seconds || 3) * 1000);
        response = await retry();
      }
      setWaitingRoom(null);

      if (!isReservationRequestStatus(response)) {
        throw new Error('예약 처리 대기 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.');
      }

      const finalStatus = await waitForReservationRequest(response, (status) => {
        setRequestProgress(requestProgressMessage(status));
      });

      if (isRequestFailure(finalStatus.status)) {
        throw new Error(finalStatus.error_message || '예약 요청을 처리하지 못했습니다.');
      }

      return finalStatus;
    },
    [],
  );

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const key = reservationKey(cancelTarget);
    if (!key) {
      setError('취소할 예약을 찾을 수 없습니다.');
      setCancelTarget(null);
      return;
    }

    setCancelling(true);
    setError('');
    setMessage('');
    setCancelTarget(null);
    setWaitingRoomAction('예약 취소');
    setRequestProgress('예약 취소 요청을 접수하고 있습니다.');
    try {
      const { idempotencyKey, storageKey } = getAttemptKey('cancel-reservation', key);
      const requestCancel = () =>
        apiGatewayDelete<ReservationRequestStatus | WaitingRoomResponse>(`/reservations/${key}`, {
          'Idempotency-Key': idempotencyKey,
        });
      await resolveMutationResponse(await requestCancel(), requestCancel);
      clearAttemptKey(storageKey);
      setMessage('예약 취소가 확정되었습니다.');
      setCancelTarget(null);
      await fetchReservations();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setWaitingRoom(null);
      setRequestProgress('');
      setCancelling(false);
    }
  };

  const openEdit = (reservation: UserReservation) => {
    setError('');
    setMessage('');
    setEditTarget(reservation);
    setEditForm({
      quantity: reservationQuantity(reservation),
      time_slot_uuid: reservationTimeSlotUuid(reservation),
    });
  };

  const editSchedule = editTarget ? schedules.find((schedule) => schedule.uuid === reservationScheduleUuid(editTarget)) : undefined;
  const editProduct = editSchedule?.products.find((product) => product.uuid === (editTarget ? reservationProductUuid(editTarget) : ''));
  const editMaxQuantity = Math.max(
    1,
    editProduct?.per_user_limit && editProduct.per_user_limit > 0 ? editProduct.per_user_limit : editForm.quantity,
  );
  const editQuantityValue = Math.min(editForm.quantity, editMaxQuantity);

  const submitEdit = async () => {
    if (!editTarget) return;
    const key = reservationKey(editTarget);
    if (!key) {
      setError('수정할 예약을 찾을 수 없습니다.');
      setEditTarget(null);
      return;
    }

    setEditing(true);
    setError('');
    setMessage('');
    setWaitingRoomAction('예약 수정');
    setRequestProgress('예약 수정 요청을 접수하고 있습니다.');
    try {
      const body = {
        quantity: editQuantityValue,
        time_slot_uuid: editForm.time_slot_uuid || undefined,
      };
      const { idempotencyKey, storageKey } = getAttemptKey(
        'update-reservation',
        JSON.stringify({ reservation_uuid: key, ...body }),
      );
      const requestBody = { ...body, idempotency_key: idempotencyKey };
      const requestUpdate = () =>
        apiGatewayPatch<ReservationRequestStatus | WaitingRoomResponse>(`/reservations/${key}`, requestBody);
      await resolveMutationResponse(await requestUpdate(), requestUpdate);
      clearAttemptKey(storageKey);
      setMessage('예약 수정이 확정되었습니다.');
      setEditTarget(null);
      await fetchReservations();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setWaitingRoom(null);
      setRequestProgress('');
      setEditing(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="내 예약" description="현재 예약 내역을 불러오고 있습니다.">
        <LoadingSpinner size="lg" message="예약을 불러오는 중..." />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="내 예약"
      description="현재 예약을 확인하고, 필요하면 예약을 수정하거나 취소합니다."
      actions={
        <button type="button" className="btn btn-secondary" onClick={fetchReservations} disabled={loading}>
          <RefreshCw size={17} aria-hidden="true" />
          새로고침
        </button>
      }
    >
      <div className="stack-lg">
        {error && (
          <div className="message message-error">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {message && <div className="message message-success">{message}</div>}
        {requestProgress && <div className="message message-info">{requestProgress}</div>}

        {reservations.length === 0 ? (
          <div className="empty-state">
            <strong>현재 예약이 없습니다.</strong>
            <span>예약 가능한 일정에서 상품을 선택해 주세요.</span>
          </div>
        ) : (
          Object.entries(grouped).map(([date, items]) => (
            <section key={date} className="surface">
              <div className="surface-header">
                <div>
                  <p className="eyebrow">판매 일자</p>
                  <h2>{formatSaleDate(date)}</h2>
                </div>
                <span className="badge badge-info">{items.length}건</span>
              </div>
              <div className="surface-body">
                {items.map((reservation) => {
                  const key = reservationKey(reservation);
                  return (
                    <article key={key || `${reservation.sale_date}-${reservation.created_at}`} className="list-row">
                      <div className="row-main">
                        <p className="row-title">
                          {reservation.schedule_title || reservationItems(reservation)[0]?.schedule_title || '예약 일정'}
                        </p>
                        <div className="row-meta">
                          <span>예약 일시: {formatDateTime(reservation.created_at || reservation.reserved_at)}</span>
                          {reservation.time_slot_label ? <span>방문 시간 {reservation.time_slot_label}</span> : null}
                        </div>
                        <div className="stack" style={{ marginTop: 'var(--space-3)' }}>
                          {reservationItems(reservation).map((item, index) => (
                            <div key={`${item.product_name}-${index}`} className="message message-info">
                              <span>
                                {item.group_name ? `${item.group_name} · ` : ''}
                                {item.product_name || '상품'} {item.quantity ? `${item.quantity}개` : ''}
                                {item.time_slot_label ? ` · 방문 시간 ${item.time_slot_label}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="heading-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => openEdit(reservation)}
                          disabled={!canEditReservation(reservation)}
                        >
                          <Pencil size={17} aria-hidden="true" />
                          예약 수정
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => setCancelTarget(reservation)}
                          disabled={!canEditReservation(reservation)}
                        >
                          <CalendarX size={17} aria-hidden="true" />
                          취소
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="예약을 취소할까요?"
        message="예약 취소 후에는 같은 조건으로 다시 예약하지 못할 수 있습니다. 정말 취소하시겠습니까?"
        confirmText="예약 취소"
        variant="danger"
        loading={cancelling}
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />

      {editTarget && (
        <>
          <div className="overlay" onClick={() => (editing ? undefined : setEditTarget(null))} />
          <div className="modal animate-scale-in" role="dialog" aria-modal="true" aria-labelledby="edit-reservation-title">
            <div className="modal-header">
              <div>
                <p className="eyebrow">예약 수정</p>
                <h3 id="edit-reservation-title">{editTarget.schedule_title || '예약 일정'}</h3>
              </div>
            </div>
            <div className="modal-body stack">
              {error && (
                <div className="message message-error">
                  <AlertCircle size={18} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
              <div className="form-group">
                <label className="form-label" htmlFor="edit-quantity">
                  수량
                </label>
                <select
                  id="edit-quantity"
                  value={editQuantityValue}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, quantity: Number(event.target.value) }))}
                >
                  {Array.from({ length: editMaxQuantity }, (_, index) => index + 1).map((quantity) => (
                    <option key={quantity} value={quantity}>
                      {quantity}개
                    </option>
                  ))}
                </select>
                <p className="field-help">
                  {editProduct?.per_user_limit
                    ? `이 상품은 1인당 최대 ${editProduct.per_user_limit}개까지 예약할 수 있습니다.`
                    : '수정 가능한 최대 수량은 서버에서 최종 검증됩니다.'}
                </p>
              </div>

              {editSchedule?.has_time_slots && editSchedule.time_slots.length > 0 ? (
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-time-slot">
                    방문 시간
                  </label>
                  <select
                    id="edit-time-slot"
                    value={editForm.time_slot_uuid}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, time_slot_uuid: event.target.value }))}
                  >
                    <option value="">방문 시간 선택</option>
                    {editSchedule.time_slots.map((slot) => (
                      <option key={slot.uuid} value={slot.uuid}>
                        {slot.label} · 남은 자리 {slot.remaining_customers}명
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="message message-info">이 예약은 방문 시간 선택이 없는 일정입니다.</div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setEditTarget(null)} disabled={editing}>
                취소
              </button>
              <button type="button" className="btn btn-primary" onClick={submitEdit} disabled={editing}>
                <Save size={17} aria-hidden="true" />
                {editing ? '저장 중...' : '수정 저장'}
              </button>
            </div>
          </div>
        </>
      )}

      <WaitingRoomModal actionLabel={waitingRoomAction} response={waitingRoom} />
    </AppShell>
  );
}
