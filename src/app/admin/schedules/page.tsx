'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarPlus, Check, Lock, Plus, RefreshCw, Trash2, Unlock, X } from 'lucide-react';
import { apiDelete, apiGatewayPost, apiGet, apiPatch, apiPost, getErrorMessage } from '@/lib/api';
import { formatSaleDate } from '@/lib/format';
import { useRequireAdmin } from '@/lib/useAuthGuard';
import type {
  Product,
  Schedule,
  ScheduleDraft,
  ScheduleDraftGroup,
  ScheduleDraftProduct,
  ScheduleDraftTimeSlot,
  ScheduleDateMutationResponse,
} from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const createDraftProduct = (): ScheduleDraftProduct => ({
  name: '',
  stock_quantity: 1,
  per_user_limit: 1,
});

const createDraftGroup = (name = '기본 상품'): ScheduleDraftGroup => ({
  name,
  purchase_limit: 1,
  products: [createDraftProduct()],
});

const createEmptyDraft = (): ScheduleDraft => ({
  sale_date: '',
  title: '',
  can_bundle: true,
  has_time_slots: true,
  reservation_open: false,
  time_slots: [{ label: '14:00', capacity: 10 }],
  groups: [createDraftGroup()],
});

type ProductGroupSummary = {
  key: string;
  name: string;
  purchaseLimit?: number;
  products: Product[];
};

type ConfirmAction =
  | { type: 'delete'; schedule: Schedule }
  | { type: 'openDate'; saleDate: string }
  | { type: 'closeDate'; saleDate: string }
  | { type: 'resetDate'; saleDate: string }
  | null;

function toPositiveInteger(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function formatQuantity(value: number | undefined, unit = '개') {
  if (typeof value !== 'number') return '-';
  return `${value.toLocaleString('ko-KR')}${unit}`;
}

function summarizeProductGroups(products: Product[]): ProductGroupSummary[] {
  const groups = new Map<string, ProductGroupSummary>();

  products.forEach((product, index) => {
    const groupName = product.group_name?.trim() || '상품 그룹';
    const key = product.group_uuid || `${groupName}-${product.group_purchase_limit ?? 'limit'}-${index}`;
    const existing = groups.get(key);

    if (existing) {
      existing.products.push(product);
      return;
    }

    groups.set(key, {
      key,
      name: groupName,
      purchaseLimit: product.group_purchase_limit,
      products: [product],
    });
  });

  return Array.from(groups.values());
}

function normalizeDraft(draft: ScheduleDraft): ScheduleDraft {
  return {
    ...draft,
    title: draft.title.trim(),
    time_slots: draft.has_time_slots
      ? draft.time_slots.map((slot) => ({
          label: slot.label,
          capacity: toPositiveInteger(slot.capacity),
        }))
      : [],
    groups: draft.groups.map((group) => ({
      name: group.name.trim(),
      purchase_limit: toPositiveInteger(group.purchase_limit),
      products: group.products.map((product) => ({
        name: product.name.trim(),
        stock_quantity: toPositiveInteger(product.stock_quantity),
        per_user_limit: toPositiveInteger(product.per_user_limit),
      })),
    })),
  };
}

function scheduleDateMutationMessage(action: 'open' | 'close', result: ScheduleDateMutationResponse) {
  const base =
    action === 'open'
      ? `판매 일자 ${formatSaleDate(result.sale_date)}을 예약 가능 상태로 저장했습니다.`
      : `판매 일자 ${formatSaleDate(result.sale_date)}을 예약 마감 상태로 저장했습니다.`;

  if (!result.waiting_room_sync) return base;

  if (!result.waiting_room_synced) {
    return `${base} 하지만 Vercel 대기실 상태 동기화에 실패했습니다. 잠시 뒤 다시 해당 일자 ${
      action === 'open' ? '열기' : '닫기'
    }를 눌러 동기화해 주세요. ${result.waiting_room_sync_error || ''}`.trim();
  }

  if (action === 'open' && result.waiting_room_sync.desired_open) {
    return `${base} Vercel 대기실도 열렸습니다.`;
  }

  if (action === 'open' && !result.waiting_room_sync.desired_open) {
    return `${base} 해당 날짜에 등록된 판매 일정이 없어 대기실은 열지 않았습니다.`;
  }

  return `${base} Vercel 대기실도 닫혔습니다.`;
}

export default function AdminSchedulesPage() {
  useRequireAdmin();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [draft, setDraft] = useState<ScheduleDraft>(() => createEmptyDraft());
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

  const updateTimeSlot = (index: number, patch: Partial<ScheduleDraftTimeSlot>) => {
    setDraft((prev) => ({
      ...prev,
      time_slots: prev.time_slots.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot)),
    }));
  };

  const addTimeSlot = () => {
    setDraft((prev) => ({
      ...prev,
      time_slots: [...prev.time_slots, { label: '14:30', capacity: 10 }],
    }));
  };

  const removeTimeSlot = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      time_slots: prev.time_slots.filter((_, slotIndex) => slotIndex !== index),
    }));
  };

  const updateGroup = (groupIndex: number, patch: Partial<ScheduleDraftGroup>) => {
    setDraft((prev) => ({
      ...prev,
      groups: prev.groups.map((group, index) => (index === groupIndex ? { ...group, ...patch } : group)),
    }));
  };

  const addGroup = () => {
    setDraft((prev) => ({
      ...prev,
      groups: [...prev.groups, createDraftGroup('추가 상품 그룹')],
    }));
  };

  const removeGroup = (groupIndex: number) => {
    setDraft((prev) => ({
      ...prev,
      groups: prev.groups.filter((_, index) => index !== groupIndex),
    }));
  };

  const updateProduct = (groupIndex: number, productIndex: number, patch: Partial<ScheduleDraftProduct>) => {
    setDraft((prev) => ({
      ...prev,
      groups: prev.groups.map((group, index) => {
        if (index !== groupIndex) return group;
        return {
          ...group,
          products: group.products.map((product, nestedIndex) =>
            nestedIndex === productIndex ? { ...product, ...patch } : product,
          ),
        };
      }),
    }));
  };

  const addProduct = (groupIndex: number) => {
    setDraft((prev) => ({
      ...prev,
      groups: prev.groups.map((group, index) =>
        index === groupIndex ? { ...group, products: [...group.products, createDraftProduct()] } : group,
      ),
    }));
  };

  const removeProduct = (groupIndex: number, productIndex: number) => {
    setDraft((prev) => ({
      ...prev,
      groups: prev.groups.map((group, index) =>
        index === groupIndex
          ? { ...group, products: group.products.filter((_, nestedIndex) => nestedIndex !== productIndex) }
          : group,
      ),
    }));
  };

  const saveSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await apiPost('/admin/schedules', normalizeDraft(draft), true);
      setMessage('판매 일정이 저장되었습니다.');
      setDraft(createEmptyDraft());
      await fetchSchedules();
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
      await fetchSchedules();
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
        setMessage('판매 일정을 삭제했습니다.');
      }
      if (confirmAction.type === 'openDate') {
        const result = await apiGatewayPost<ScheduleDateMutationResponse>(
          `/admin/schedule-dates/${confirmAction.saleDate}/open`,
          undefined,
          true,
        );
        setMessage(scheduleDateMutationMessage('open', result));
      }
      if (confirmAction.type === 'closeDate') {
        const result = await apiGatewayPost<ScheduleDateMutationResponse>(
          `/admin/schedule-dates/${confirmAction.saleDate}/close`,
          undefined,
          true,
        );
        setMessage(scheduleDateMutationMessage('close', result));
      }
      if (confirmAction.type === 'resetDate') {
        await apiPost(`/admin/schedule-dates/${confirmAction.saleDate}/reset-reservations`, undefined, true);
        setMessage(`${formatSaleDate(confirmAction.saleDate)} 예약을 리셋했습니다.`);
      }
      setConfirmAction(null);
      await fetchSchedules();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmText = (() => {
    if (!confirmAction) return { title: '확인', message: '', confirmText: '확인', variant: 'default' as const };
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
        message: '해당 날짜의 현재 예약을 모두 취소합니다. 정말 리셋하시겠습니까?',
        confirmText: '예약 리셋',
        variant: 'danger' as const,
      };
    }
    return {
      title: confirmAction.type === 'openDate' ? '예약을 열까요?' : '예약을 닫을까요?',
      message: `${formatSaleDate(confirmAction.saleDate)}에 묶인 모든 일정의 예약 상태가 바뀝니다.`,
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

            <div className="schedule-form-section schedule-form-section-first">
              <div className="section-heading">
                <div>
                  <h3>기본 정보</h3>
                  <p>사용자가 고를 판매 날짜와 일정 이름입니다.</p>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="sale-date">
                    판매 날짜
                  </label>
                  <input
                    id="sale-date"
                    type="date"
                    value={draft.sale_date}
                    onChange={(event) => updateDraft('sale_date', event.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="schedule-title">
                    판매 일정 이름
                  </label>
                  <input
                    id="schedule-title"
                    value={draft.title}
                    onChange={(event) => updateDraft('title', event.target.value)}
                    placeholder="예: 1차 예약"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="schedule-form-section">
              <div className="section-heading">
                <div>
                  <h3>예약 방식</h3>
                  <p>방문 시간 선택과 같은 날짜 내 중복 예약 허용 여부를 정합니다.</p>
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
            </div>

            {draft.has_time_slots && (
              <div className="schedule-form-section">
                <div className="section-heading">
                  <div>
                    <h3>방문 시간</h3>
                    <p>시간대별로 받을 수 있는 최대 방문 고객 수를 입력합니다.</p>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addTimeSlot}>
                    <Plus size={15} aria-hidden="true" />
                    추가
                  </button>
                </div>
                <div className="repeatable-list">
                  {draft.time_slots.map((slot, index) => (
                    <div key={`slot-${index}`} className="field-row">
                      <div className="form-group">
                        <label className="form-label" htmlFor={`slot-label-${index}`}>
                          방문 시간
                        </label>
                        <input
                          id={`slot-label-${index}`}
                          type="time"
                          value={slot.label}
                          onChange={(event) => updateTimeSlot(index, { label: event.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor={`slot-capacity-${index}`}>
                          시간대별 최대 고객 수
                        </label>
                        <input
                          id={`slot-capacity-${index}`}
                          type="number"
                          min={1}
                          value={slot.capacity}
                          onChange={(event) => updateTimeSlot(index, { capacity: toPositiveInteger(Number(event.target.value)) })}
                          required
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm row-remove-button"
                        onClick={() => removeTimeSlot(index)}
                        disabled={draft.time_slots.length <= 1}
                        aria-label="방문 시간 삭제"
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="schedule-form-section">
              <div className="section-heading">
                <div>
                  <h3>상품 그룹</h3>
                  <p>그룹 안의 상품과 수량 제한을 한눈에 확인할 수 있게 입력합니다.</p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addGroup}>
                  <Plus size={15} aria-hidden="true" />
                  그룹 추가
                </button>
              </div>

              <div className="repeatable-list">
                {draft.groups.map((group, groupIndex) => (
                  <div key={`group-${groupIndex}`} className="repeatable-block group-editor">
                    <div className="section-heading section-heading-compact">
                      <div>
                        <h4>상품 그룹 {groupIndex + 1}</h4>
                        <p>같은 그룹 안에서 고를 수 있는 총 수량을 제한합니다.</p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => removeGroup(groupIndex)}
                        disabled={draft.groups.length <= 1}
                      >
                        그룹 삭제
                      </button>
                    </div>

                    <div className="group-settings-grid">
                      <div className="form-group">
                        <label className="form-label" htmlFor={`group-name-${groupIndex}`}>
                          그룹 이름
                        </label>
                        <input
                          id={`group-name-${groupIndex}`}
                          value={group.name}
                          onChange={(event) => updateGroup(groupIndex, { name: event.target.value })}
                          placeholder="예: 박스 상품"
                          required
                        />
                      </div>
                      <div className="form-group compact-number-field">
                        <label className="form-label" htmlFor={`group-purchase-limit-${groupIndex}`}>
                          그룹 내 구매 제한
                        </label>
                        <input
                          id={`group-purchase-limit-${groupIndex}`}
                          type="number"
                          min={1}
                          value={group.purchase_limit}
                          onChange={(event) => updateGroup(groupIndex, { purchase_limit: toPositiveInteger(Number(event.target.value)) })}
                          required
                        />
                      </div>
                    </div>
                    <p className="field-help">그룹 내 구매 제한은 같은 상품 그룹 안에서 한 사람이 총 몇 개까지 고를 수 있는지입니다.</p>

                    <div className="product-editor-table">
                      <div className="product-editor-head" aria-hidden="true">
                        <span>상품 이름</span>
                        <span>총 재고</span>
                        <span>1인 제한</span>
                        <span>삭제</span>
                      </div>
                      {group.products.map((product, productIndex) => (
                        <div key={`product-${groupIndex}-${productIndex}`} className="product-editor-row">
                          <input
                            id={`product-name-${groupIndex}-${productIndex}`}
                            aria-label={`상품 그룹 ${groupIndex + 1}의 상품 이름`}
                            value={product.name}
                            onChange={(event) => updateProduct(groupIndex, productIndex, { name: event.target.value })}
                            placeholder="예: 확장팩 1박스"
                            required
                          />
                          <input
                            id={`product-stock-${groupIndex}-${productIndex}`}
                            aria-label={`상품 그룹 ${groupIndex + 1}의 총 재고`}
                            type="number"
                            min={1}
                            value={product.stock_quantity}
                            onChange={(event) =>
                              updateProduct(groupIndex, productIndex, { stock_quantity: toPositiveInteger(Number(event.target.value)) })
                            }
                            required
                          />
                          <input
                            id={`product-user-limit-${groupIndex}-${productIndex}`}
                            aria-label={`상품 그룹 ${groupIndex + 1}의 1인 제한`}
                            type="number"
                            min={1}
                            value={product.per_user_limit}
                            onChange={(event) =>
                              updateProduct(groupIndex, productIndex, { per_user_limit: toPositiveInteger(Number(event.target.value)) })
                            }
                            required
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm row-remove-button"
                            onClick={() => removeProduct(groupIndex, productIndex)}
                            disabled={group.products.length <= 1}
                            aria-label="상품 삭제"
                          >
                            <X size={15} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="product-editor-table-note">
                      총 재고는 상품별 전체 예약 가능 수량이고, 1인 제한은 해당 상품을 한 사람이 예약할 수 있는 최대 수량입니다.
                    </p>

                    <button type="button" className="btn btn-secondary btn-sm add-row-button" onClick={() => addProduct(groupIndex)}>
                      <Plus size={15} aria-hidden="true" />
                      상품 추가
                    </button>
                  </div>
                ))}
              </div>
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
                    <div className="schedule-table-wrap">
                      <table className="schedule-table">
                        <thead>
                          <tr>
                            <th scope="col">일정</th>
                            <th scope="col">상태</th>
                            <th scope="col">방문 시간</th>
                            <th scope="col">상품과 재고</th>
                            <th scope="col">작업</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((schedule) => {
                            const productGroups = summarizeProductGroups(schedule.products);
                            return (
                              <tr key={schedule.uuid}>
                                <td className="schedule-title-cell">
                                  <strong>{schedule.title}</strong>
                                  <span>상품 {schedule.products.length}개</span>
                                </td>
                                <td>
                                  <div className="status-stack">
                                    <span className={`badge ${schedule.reservation_open ? 'badge-success' : 'badge-warning'}`}>
                                      {schedule.reservation_open ? '예약 받는 중' : '예약 닫힘'}
                                    </span>
                                    <span className={`badge ${schedule.can_bundle ? 'badge-info' : 'badge-warning'}`}>
                                      {schedule.can_bundle ? '함께 예약 가능' : '단독 예약'}
                                    </span>
                                    <span className="badge badge-info">
                                      {schedule.has_time_slots ? '방문 시간 사용' : '방문 시간 없음'}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  {schedule.has_time_slots && schedule.time_slots.length > 0 ? (
                                    <div className="mini-table mini-table-time" role="table" aria-label={`${schedule.title} 방문 시간`}>
                                      <div className="mini-table-head" role="row">
                                        <span>시간</span>
                                        <span>정원</span>
                                        <span>잔여</span>
                                      </div>
                                      {schedule.time_slots.map((slot) => (
                                        <div key={slot.uuid || slot.label} className="mini-table-row" role="row">
                                          <span>{slot.label}</span>
                                          <span>{formatQuantity(slot.capacity, '명')}</span>
                                          <span>{formatQuantity(slot.remaining_customers, '명')}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="muted">방문 시간 없음</span>
                                  )}
                                </td>
                                <td>
                                  <div className="schedule-product-table-list">
                                    {productGroups.map((group) => (
                                      <div key={group.key} className="schedule-product-table-group">
                                        <div className="table-group-title">
                                          <strong>{group.name}</strong>
                                          <span className="constraint-pill">그룹 제한 {formatQuantity(group.purchaseLimit)}</span>
                                        </div>
                                        <div className="mini-table mini-table-products" role="table" aria-label={`${group.name} 상품 재고`}>
                                          <div className="mini-table-head" role="row">
                                            <span>상품</span>
                                            <span>총 재고</span>
                                            <span>남은 수량</span>
                                            <span>1인 제한</span>
                                          </div>
                                          {group.products.map((product) => (
                                            <div key={product.uuid} className="mini-table-row" role="row">
                                              <span className="inventory-product-name">{product.name}</span>
                                              <span>{formatQuantity(product.stock_quantity)}</span>
                                              <span>{formatQuantity(product.stock_remaining)}</span>
                                              <span>{formatQuantity(product.per_user_limit)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                                <td>
                                  <div className="table-actions">
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
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
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
