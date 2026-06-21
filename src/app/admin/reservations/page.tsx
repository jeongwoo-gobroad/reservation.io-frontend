'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { apiGet, getErrorMessage } from '@/lib/api';
import { formatDateTime, formatSaleDate, reservationKey, toQueryString } from '@/lib/format';
import { useRequireAdmin } from '@/lib/useAuthGuard';
import type { AdminReservation, ReservationItem } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import LoadingSpinner from '@/components/common/LoadingSpinner';

function reservationItems(reservation: AdminReservation): ReservationItem[] {
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

function customerDisplayName(reservation: AdminReservation) {
  return reservation.customer_name || reservation.nickname || '-';
}

export default function AdminReservationsPage() {
  useRequireAdmin();
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const [saleDate, setSaleDate] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<AdminReservation[]>(
        `/admin/reservations${toQueryString({ sale_date: saleDate, nickname })}`,
        true,
      );
      setReservations(data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [nickname, saleDate]);

  useEffect(() => {
    void Promise.resolve().then(fetchReservations);
  }, [fetchReservations]);

  const grouped = useMemo(() => {
    return reservations.reduce<Record<string, AdminReservation[]>>((acc, reservation) => {
      const date = reservation.sale_date || '날짜 미정';
      if (!acc[date]) acc[date] = [];
      acc[date].push(reservation);
      return acc;
    }, {});
  }, [reservations]);

  return (
    <AppShell
      variant="admin"
      title="현재 예약 현황"
      description="예약된 고객과 상품을 날짜별로 확인합니다."
      actions={
        <button type="button" className="btn btn-secondary" onClick={fetchReservations}>
          <RefreshCw size={17} aria-hidden="true" />
          새로고침
        </button>
      }
    >
      <div className="stack-lg">
        <form
          className="surface surface-body toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            fetchReservations();
          }}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="reservation-sale-date">날짜</label>
            <input id="reservation-sale-date" type="date" value={saleDate} onChange={(event) => setSaleDate(event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reservation-nickname">닉네임</label>
            <input id="reservation-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="닉네임 검색" />
          </div>
          <button type="submit" className="btn btn-primary">
            <Search size={17} aria-hidden="true" />
            조회
          </button>
        </form>

        {error && <div className="message message-error">{error}</div>}

        {loading ? (
          <LoadingSpinner size="lg" message="예약 현황을 불러오는 중..." />
        ) : reservations.length === 0 ? (
          <div className="empty-state">
            <strong>조회된 예약이 없습니다.</strong>
            <span>필터 조건을 바꾸어 다시 조회해 주세요.</span>
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
              <div className="surface-body table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>고객</th>
                      <th>일정</th>
                      <th>상품</th>
                      <th>방문 시간</th>
                      <th>예약 일시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((reservation) => (
                      <tr key={reservationKey(reservation) || `${customerDisplayName(reservation)}-${reservation.created_at}`}>
                        <td>{customerDisplayName(reservation)}</td>
                        <td>{reservation.schedule_title || reservationItems(reservation)[0]?.schedule_title || '-'}</td>
                        <td>
                          {reservationItems(reservation).map((item, index) => (
                            <div key={`${item.product_name}-${index}`}>
                              {item.group_name ? `${item.group_name} · ` : ''}
                              {item.product_name || '-'} {item.quantity ? `${item.quantity}개` : ''}
                            </div>
                          ))}
                        </td>
                        <td>{reservation.time_slot_label || reservationItems(reservation)[0]?.time_slot_label || '-'}</td>
                        <td>{formatDateTime(reservation.created_at || reservation.reserved_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}
