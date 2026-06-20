'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Check, Lock, RefreshCw, Trash2, Unlock } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, getErrorMessage } from '@/lib/api';
import { formatSaleDate } from '@/lib/format';
import { useRequireAdmin } from '@/lib/useAuthGuard';
import type { Schedule, ScheduleDraft } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const emptyDraft: ScheduleDraft = {
  sale_date: '',
  title: '',
  can_bundle: true,
  has_time_slots: true,
  reservation_open: false,
  time_slots: [{ label: '14:00', capacity: 10 }],
  groups: [
    {
      name: '기본 상품',
      purchase_limit: 1,
      products: [{ name: '', stock_quantity: 1, per_user_limit: 1 }],
    },
  ],
};

type ConfirmAction =
  | { type: 'delete'; schedule: Schedule }
  | { type: 'openDate'; saleDate: string }
  | { type: 'closeDate'; saleDate: string }
  | { type: 'resetDate'; saleDate: string }
  | null;

export default function AdminSchedulesPage() {
  useRequireAdmin();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [draft, setDraft] = useState<ScheduleDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<Schedule[]>('/admin/schedules', true);
      setSchedules(data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchSchedules);
  }, [fetchSchedules]);

  const schedulesByDate = useMemo(() => {
    return schedules
      .slice()
      .sort((a, b) => a.sale_date.localeCompare(b.sale_date) || a.title.localeCompare(b.title))
      .reduce<Record<string, Schedule[]>>((acc, schedule) => {
        if (!acc[schedule.sale_date]) acc[schedule.sale_date] = [];
        acc[schedule.sale_date].push(schedule);
        return acc;
      }, {});
  }, [schedules]);

  const updateDraft = <K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const saveSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const body = {
        ...draft,
        time_slots: draft.has_time_slots ? draft.time_slots : [],
      };
      await apiPost('/admin/schedules', body, true);
      setMessage('판매 일정이 저장되었습니다.');
      setDraft(emptyDraft);
      fetchSchedules();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const patchSchedule = async (schedule: Schedule, patch: Partial<Schedule>) => {
    setSaving(true);
    setError('');
    try {
      await apiPatch(`/admin/schedules/${schedule.uuid}`, patch, true);
      setMessage('일정 설정이 변경되었습니다.');
      fetchSchedules();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    setSaving(true);
    setError('');
    try {
      if (confirmAction.type === 'delete') {
        await apiDelete(`/admin/schedules/${confirmAction.schedule.uuid}`, true);
        setMessage('판매 일정이 삭제되었습니다.');
      }
      if (confirmAction.type === 'openDate') {
        await apiPost(`/admin/schedule-dates/${confirmAction.saleDate}/open`, undefined, true);
        setMessage(`${formatSaleDate(confirmAction.saleDate)} 예약을 열었습니다.`);
      }
      if (confirmAction.type === 'closeDate') {
        await apiPost(`/admin/schedule-dates/${confirmAction.saleDate}/close`, undefined, true);
        setMessage(`${formatSaleDate(confirmAction.saleDate)} 예약을 닫았습니다.`);
      }
      if (confirmAction.type === 'resetDate') {
        await apiPost(`/admin/schedule-dates/${confirmAction.saleDate}/reset-reservations`, undefined, true);
        setMessage(`${formatSaleDate(confirmAction.saleDate)} 예약을 리셋했습니다.`);
      }
      setConfirmAction(null);
      fetchSchedules();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmText = (() => {
    if (!confirmAction) return { title: '', message: '', confirmText: '확인', variant: 'default' as const };
    if (confirmAction.type === 'delete') {
      return {
        title: '판매 일정을 삭제할까요?',
        message: '삭제한 일정은 되돌리기 어렵습니다. 정말 삭제하시겠습니까?',
        confirmText: '삭제',
        variant: 'danger' as const,
      };
    }
    if (confirmAction.type === 'resetDate') {
      return {
        title: '예약을 리셋할까요?',
        message: '해당 날짜의 현재 예약이 모두 취소됩니다. 정말 리셋하시겠습니까?',
        confirmText: '예약 리셋',
        variant: 'danger' as const,
      };
    }
    return {
      title: confirmAction.type === 'openDate' ? '예약을 열까요?' : '예약을 닫을까요?',
      message: `${formatSaleDate(confirmAction.saleDate)}에 속한 모든 일정의 예약 상태가 바뀝니다.`,
      confirmText: confirmAction.type === 'openDate' ? '예약 열기' : '예약 닫기',
      variant: 'warning' as const,
    };
  })();

  return (
    <AppShell
      variant="admin"
      title="판매 일정 관리"
      description="판매 날짜, 상품, 재고, 방문 시간을 만들고 예약 가능 상태를 관리합니다."
      actions={
        <button type="button" className="btn btn-secondary" onClick={fetchSchedules}>
          <RefreshCw size={17} aria-hidden="true" />
          새로고침
        </button>
      }
    >
      <div className="dashboard-grid">
        <section className="surface span-5">
          <div className="surface-header">
            <div>
              <p className="eyebrow">새 일정</p>
              <h2>판매 일정 만들기</h2>
            </div>
            <CalendarPlus size={22} aria-hidden="true" />
          </div>
          <form className="surface-body stack" onSubmit={saveSchedule}>
            {error && <div className="message message-error">{error}</div>}
            {message && <div className="message message-success">{message}</div>}
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="sale-date">판매 날짜</label>
                <input
                  id="sale-date"
                  type="date"
                  value={draft.sale_date}
                  onChange={(event) => updateDraft('sale_date', event.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="schedule-title">판매 일정 이름</label>
                <input
                  id="schedule-title"
                  value={draft.title}
                  onChange={(event) => updateDraft('title', event.target.value)}
                  placeholder="예: 1차 예약"
                  required
                />
              </div>
            </div>

            <label className="check-line">
              <input
                type="checkbox"
                checked={draft.has_time_slots}
                onChange={(event) => updateDraft('has_time_slots', event.target.checked)}
              />
              방문 시간을 나누어 받기
            </label>
            <label className="check-line">
              <input
                type="checkbox"
                checked={draft.can_bundle}
                onChange={(event) => updateDraft('can_bundle', event.target.checked)}
              />
              같은 일자 내 다른 일정과 함께 예약 가능
            </label>
            <label className="check-line">
              <input
                type="checkbox"
                checked={draft.reservation_open}
                onChange={(event) => updateDraft('reservation_open', event.target.checked)}
              />
              저장 후 바로 예약 받기
            </label>

            {draft.has_time_slots && (
              <div className="stack">
                <div className="surface-header" style={{ padding: 0 }}>
                  <h3>방문 시간</h3>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => updateDraft('time_slots', [...draft.time_slots, { label: '14:30', capacity: 10 }])}
                  >
                    추가
                  </button>
                </div>
                {draft.time_slots.map((slot, index) => (
                  <div key={index} className="form-grid">
                    <input
                      type="time"
                      value={slot.label}
                      onChange={(event) => {
                        const next = draft.time_slots.slice();
                        next[index] = { ...slot, label: event.target.value };
                        updateDraft('time_slots', next);
                      }}
                    />
                    <input
                      type="number"
                      min={1}
                      value={slot.capacity}
                      onChange={(event) => {
                        const next = draft.time_slots.slice();
                        next[index] = { ...slot, capacity: Number(event.target.value) };
                        updateDraft('time_slots', next);
                      }}
                      aria-label="시간대별 최대 고객 수"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="stack">
              <div className="surface-header" style={{ padding: 0 }}>
                <h3>상품 그룹</h3>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    updateDraft('groups', [
                      ...draft.groups,
                      { name: '추가 상품', purchase_limit: 1, products: [{ name: '', stock_quantity: 1, per_user_limit: 1 }] },
                    ])
                  }
                >
                  그룹 추가
                </button>
              </div>
              {draft.groups.map((group, groupIndex) => (
                <div key={groupIndex} className="stack" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)' }}>
                  <div className="form-grid">
                    <input
                      value={group.name}
                      onChange={(event) => {
                        const groups = draft.groups.slice();
                        groups[groupIndex] = { ...group, name: event.target.value };
                        updateDraft('groups', groups);
                      }}
                      placeholder="그룹 이름"
                      required
                    />
                    <input
                      type="number"
                      min={1}
                      value={group.purchase_limit}
                      onChange={(event) => {
                        const groups = draft.groups.slice();
                        groups[groupIndex] = { ...group, purchase_limit: Number(event.target.value) };
                        updateDraft('groups', groups);
                      }}
                      aria-label="그룹 내 구매 제한"
                    />
                  </div>
                  {group.products.map((product, productIndex) => (
                    <div key={productIndex} className="form-grid">
                      <input
                        value={product.name}
                        onChange={(event) => {
                          const groups = draft.groups.slice();
                          const products = group.products.slice();
                          products[productIndex] = { ...product, name: event.target.value };
                          groups[groupIndex] = { ...group, products };
                          updateDraft('groups', groups);
                        }}
                        placeholder="상품 이름"
                        required
                      />
                      <input
                        type="number"
                        min={1}
                        value={product.stock_quantity}
                        onChange={(event) => {
                          const groups = draft.groups.slice();
                          const products = group.products.slice();
                          products[productIndex] = { ...product, stock_quantity: Number(event.target.value) };
                          groups[groupIndex] = { ...group, products };
                          updateDraft('groups', groups);
                        }}
                        aria-label="총 재고"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const groups = draft.groups.slice();
                      groups[groupIndex] = {
                        ...group,
                        products: [...group.products, { name: '', stock_quantity: 1, per_user_limit: 1 }],
                      };
                      updateDraft('groups', groups);
                    }}
                  >
                    상품 추가
                  </button>
                </div>
              ))}
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
              {saving ? '저장 중...' : '판매 일정 저장'}
            </button>
          </form>
        </section>

        <section className="surface span-7">
          <div className="surface-header">
            <div>
              <p className="eyebrow">목록</p>
              <h2>판매 일정</h2>
            </div>
          </div>
          <div className="surface-body">
            {loading ? (
              <LoadingSpinner message="일정을 불러오는 중..." />
            ) : Object.keys(schedulesByDate).length === 0 ? (
              <div className="empty-state">
                <strong>등록된 판매 일정이 없습니다.</strong>
                <span>왼쪽 양식에서 첫 일정을 만들어 주세요.</span>
              </div>
            ) : (
              <div className="stack-lg">
                {Object.entries(schedulesByDate).map(([saleDate, items]) => (
                  <section key={saleDate} className="stack">
                    <div className="date-section-header">
                      <div>
                        <p className="eyebrow">판매 일자</p>
                        <h3>{formatSaleDate(saleDate)}</h3>
                      </div>
                      <div className="heading-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmAction({ type: 'openDate', saleDate })}>
                          <Unlock size={15} aria-hidden="true" />
                          열기
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmAction({ type: 'closeDate', saleDate })}>
                          <Lock size={15} aria-hidden="true" />
                          닫기
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmAction({ type: 'resetDate', saleDate })}>
                          예약 리셋
                        </button>
                      </div>
                    </div>
                    {items.map((schedule) => (
                      <article key={schedule.uuid} className="list-row">
                        <div className="row-main">
                          <p className="row-title">{schedule.title}</p>
                          <div className="row-meta">
                            <span>{schedule.reservation_open ? '예약 받는 중' : '예약 닫힘'}</span>
                            <span>{schedule.can_bundle ? '함께 예약 가능' : '단독 예약'}</span>
                            <span>{schedule.has_time_slots ? '방문 시간 사용' : '방문 시간 없음'}</span>
                            <span>상품 {schedule.products.length}개</span>
                          </div>
                        </div>
                        <div className="heading-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => patchSchedule(schedule, { reservation_open: !schedule.reservation_open })}
                          >
                            {schedule.reservation_open ? '예약 닫기' : '예약 열기'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => patchSchedule(schedule, { can_bundle: !schedule.can_bundle })}
                          >
                            <Check size={15} aria-hidden="true" />
                            함께 예약
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => setConfirmAction({ type: 'delete', schedule })}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                            삭제
                          </button>
                        </div>
                      </article>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmText.title}
        message={confirmText.message}
        confirmText={confirmText.confirmText}
        variant={confirmText.variant}
        loading={saving}
        onConfirm={runConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />
    </AppShell>
  );
}
