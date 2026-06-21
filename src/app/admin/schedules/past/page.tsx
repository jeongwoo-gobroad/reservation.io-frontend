'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { apiGet, getErrorMessage } from '@/lib/api';
import { formatSaleDate } from '@/lib/format';
import { useRequireAdmin } from '@/lib/useAuthGuard';
import type { PaginatedResponse, Schedule } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const LIMIT_OPTIONS = [10, 20, 50];

function formatQuantity(value: number | null | undefined, unit = '개') {
  if (typeof value !== 'number') return '-';
  return `${value.toLocaleString('ko-KR')}${unit}`;
}

function scheduleProductSummary(schedule: Schedule) {
  const productCount = schedule.products.length;
  const stockTotal = schedule.products.reduce(
    (sum, product) => sum + (typeof product.stock_quantity === 'number' ? product.stock_quantity : 0),
    0,
  );
  return `${productCount.toLocaleString('ko-KR')}개 상품 · 총 재고 ${formatQuantity(stockTotal)}`;
}

export default function AdminPastSchedulesPage() {
  useRequireAdmin();
  const [page, setPage] = useState<PaginatedResponse<Schedule> | null>(null);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<PaginatedResponse<Schedule>>(
        `/admin/schedules/past?offset=${offset}&limit=${limit}`,
        true,
      );
      setPage(data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);

  useEffect(() => {
    void Promise.resolve().then(fetchSchedules);
  }, [fetchSchedules]);

  const currentStart = page ? page.offset + 1 : offset + 1;
  const currentEnd = page ? Math.min(page.offset + page.items.length, page.total) : offset;
  const canPrevious = offset > 0;
  const canNext = Boolean(page?.has_more);

  return (
    <AppShell
      variant="admin"
      title="지난 판매 일정"
      description="마감되었거나 오늘 이전인 판매 일정을 페이지 단위로 확인합니다."
      actions={
        <>
          <Link href="/admin/schedules" className="btn btn-secondary">
            <ArrowLeft size={17} aria-hidden="true" />
            현재 일정
          </Link>
          <button type="button" className="btn btn-secondary" onClick={fetchSchedules}>
            <RefreshCw size={17} aria-hidden="true" />
            새로고침
          </button>
        </>
      }
    >
      <div className="stack-lg">
        <section className="surface surface-body toolbar">
          <div className="form-group">
            <label className="form-label" htmlFor="past-schedule-limit">
              한 번에 보기
            </label>
            <select
              id="past-schedule-limit"
              value={limit}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setOffset(0);
              }}
            >
              {LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}개
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <span className="form-label">조회 범위</span>
            <div className="message message-info">
              {page && page.total > 0
                ? `${currentStart.toLocaleString('ko-KR')} - ${currentEnd.toLocaleString('ko-KR')} / ${page.total.toLocaleString('ko-KR')}건`
                : '조회된 지난 일정이 없습니다.'}
            </div>
          </div>
        </section>

        {error ? <div className="message message-error">{error}</div> : null}

        {loading ? (
          <LoadingSpinner size="lg" message="지난 일정을 불러오는 중..." />
        ) : !page || page.items.length === 0 ? (
          <div className="empty-state">
            <strong>지난 판매 일정이 없습니다.</strong>
            <span>오늘 이후 일정은 판매 일정 관리 화면에서 확인할 수 있습니다.</span>
          </div>
        ) : (
          <section className="surface">
            <div className="surface-body table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>판매 일자</th>
                    <th>일정</th>
                    <th>상태</th>
                    <th>상품/재고</th>
                    <th>방문 시간</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((schedule) => (
                    <tr key={schedule.uuid}>
                      <td>{formatSaleDate(schedule.sale_date)}</td>
                      <td>{schedule.title}</td>
                      <td>
                        <span className={`badge ${schedule.reservation_open ? 'badge-success' : 'badge-warning'}`}>
                          {schedule.reservation_open ? '예약 받는 중' : '예약 닫힘'}
                        </span>
                      </td>
                      <td>{scheduleProductSummary(schedule)}</td>
                      <td>
                        {schedule.has_time_slots
                          ? `${schedule.time_slots.length.toLocaleString('ko-KR')}개 시간대`
                          : '방문 시간 없음'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="heading-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canPrevious || loading}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            <ChevronLeft size={17} aria-hidden="true" />
            이전
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canNext || loading}
            onClick={() => setOffset(offset + limit)}
          >
            다음
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </AppShell>
  );
}
