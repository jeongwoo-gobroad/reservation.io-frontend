'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarX, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiDelete, apiGet, getErrorMessage } from '@/lib/api';
import { formatDateTime, formatSaleDate, reservationKey } from '@/lib/format';
import { isUserLoggedIn } from '@/lib/auth';
import type { ReservationItem, UserReservation } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import LoadingSpinner from '@/components/common/LoadingSpinner';

function reservationItems(reservation: UserReservation): ReservationItem[] {
  if (reservation.items?.length) return reservation.items;
  return [
    {
      schedule_title: reservation.schedule_title,
      product_name: reservation.product_name,
      group_name: reservation.group_name,
      quantity: reservation.quantity,
      time_slot_label: reservation.time_slot_label,
    },
  ].filter((item) => item.product_name || item.schedule_title);
}

export default function ReservationsPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<UserReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<UserReservation | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<UserReservation[]>('/users/me/reservations');
      setReservations(data);
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

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const key = reservationKey(cancelTarget);
    if (!key) {
      setError('취소할 예약을 찾을 수 없습니다.');
      setCancelTarget(null);
      return;
    }

    setCancelling(true);
    try {
      await apiDelete(`/reservations/${key}`);
      setMessage('예약이 취소되었습니다.');
      setCancelTarget(null);
      fetchReservations();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCancelling(false);
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
      description="현재 예약을 확인하고, 필요하면 예약을 취소합니다."
      actions={
        <button type="button" className="btn btn-secondary" onClick={fetchReservations}>
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
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => setCancelTarget(reservation)}
                      >
                        <CalendarX size={17} aria-hidden="true" />
                        취소
                      </button>
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
    </AppShell>
  );
}
