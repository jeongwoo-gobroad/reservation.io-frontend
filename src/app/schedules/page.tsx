'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Minus, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiGatewayPost, apiGet, apiPublicGet, getErrorMessage } from '@/lib/api';
import { getUserInfo, isUserLoggedIn } from '@/lib/auth';
import { formatSaleDate } from '@/lib/format';
import {
  clearAttemptKey,
  getAttemptKey,
  isReservationRequestStatus,
  isRequestFailure,
  isWaitingRoomResponse,
  releaseWaitingRoom,
  requestProgressMessage,
  waitForReservationRequest,
  waitingRoomMessage,
} from '@/lib/reservationRequests';
import type { Product, ReservationRequestStatus, Schedule, SettingValue, UserReservation, WaitingRoomResponse } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import MarkdownViewer from '@/components/common/MarkdownViewer';
import WaitingRoomModal from '@/components/common/WaitingRoomModal';

interface SelectedItem {
  schedule_set_uuid: string;
  product_uuid: string;
  quantity: number;
  time_slot_uuid?: string;
}

interface ProductGroup {
  key: string;
  name: string;
  purchaseLimit?: number;
  products: Product[];
}

interface NoticeModal {
  title: string;
  message: string;
}

function getProductGroupKey(product: Product) {
  return product.group_uuid || `${product.group_name || '상품 그룹'}-${product.group_purchase_limit ?? 'none'}`;
}

function getPositiveLimit(value: number | undefined) {
  return typeof value === 'number' && value > 0 ? value : undefined;
}

function visibleCount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function groupProducts(products: Product[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();

  products.forEach((product) => {
    const key = getProductGroupKey(product);
    const existing = groups.get(key);

    if (existing) {
      existing.products.push(product);
      return;
    }

    groups.set(key, {
      key,
      name: product.group_name?.trim() || '상품 그룹',
      purchaseLimit: getPositiveLimit(product.group_purchase_limit),
      products: [product],
    });
  });

  return Array.from(groups.values());
}

function reservationScheduleUuid(reservation: UserReservation) {
  return reservation.schedule_set_uuid || reservation.items?.find((item) => item.schedule_set_uuid)?.schedule_set_uuid || '';
}

function isCompletedReservationStatus(status?: string) {
  return status === 'visited' || status === 'no_show';
}

function isSameDateReservationError(message: string) {
  return message.includes('같은 날짜') && message.includes('예약');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function SchedulesPage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [myReservations, setMyReservations] = useState<UserReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<Record<string, string>>({});
  const [agreementContent, setAgreementContent] = useState('');
  const [showAgreement, setShowAgreement] = useState(false);
  const [checkingAgreement, setCheckingAgreement] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [requestProgress, setRequestProgress] = useState('');
  const [waitingRoom, setWaitingRoom] = useState<WaitingRoomResponse | null>(null);
  const [noticeModal, setNoticeModal] = useState<NoticeModal | null>(null);
  const userInfo = typeof window !== 'undefined' ? getUserInfo() : null;

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const [scheduleData, reservationData] = await Promise.all([
        apiGet<Schedule[]>('/schedules/open'),
        apiGet<UserReservation[]>('/users/me/reservations').catch(() => []),
      ]);
      setSchedules(scheduleData);
      setMyReservations(reservationData);
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
    void Promise.resolve().then(fetchSchedules);
  }, [fetchSchedules, router]);

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

  const activeSaleDate = useMemo(() => {
    const first = selectedItems[0];
    if (!first) return '';
    return schedules.find((schedule) => schedule.uuid === first.schedule_set_uuid)?.sale_date || '';
  }, [schedules, selectedItems]);

  const selectedScheduleUuids = useMemo(
    () => [...new Set(selectedItems.map((item) => item.schedule_set_uuid))],
    [selectedItems],
  );

  const selectedProductCount = selectedItems.reduce((sum, item) => sum + item.quantity, 0);

  const completedScheduleUuids = useMemo(() => {
    return new Set(
      myReservations
        .filter((reservation) => isCompletedReservationStatus(reservation.status))
        .map(reservationScheduleUuid)
        .filter(Boolean),
    );
  }, [myReservations]);

  const isSelected = (scheduleUuid: string, productUuid: string) =>
    selectedItems.some((item) => item.schedule_set_uuid === scheduleUuid && item.product_uuid === productUuid);

  const getSelectedItem = (scheduleUuid: string, productUuid: string) =>
    selectedItems.find((item) => item.schedule_set_uuid === scheduleUuid && item.product_uuid === productUuid);

  const getSelectedGroupQuantity = (schedule: Schedule, groupKey: string) =>
    schedule.products
      .filter((product) => getProductGroupKey(product) === groupKey)
      .reduce((sum, product) => sum + (getSelectedItem(schedule.uuid, product.uuid)?.quantity ?? 0), 0);

  const maxQuantityFor = (product: Product) => {
    const stockRemaining = visibleCount(product.stock_remaining) ? product.stock_remaining : undefined;
    const limit = product.per_user_limit && product.per_user_limit > 0 ? product.per_user_limit : stockRemaining ?? 1;
    return Math.max(1, Math.min(stockRemaining ?? limit, limit));
  };

  const toggleProduct = (schedule: Schedule, product: Product, canAdd = true) => {
    if (visibleCount(product.stock_remaining) && product.stock_remaining <= 0) return;

    setSelectedItems((prev) => {
      const exists = prev.some(
        (item) => item.schedule_set_uuid === schedule.uuid && item.product_uuid === product.uuid,
      );
      if (exists) {
        return prev.filter(
          (item) => !(item.schedule_set_uuid === schedule.uuid && item.product_uuid === product.uuid),
        );
      }
      if (!canAdd) return prev;

      const sameDateItems = activeSaleDate && activeSaleDate !== schedule.sale_date ? [] : prev;
      return [
        ...sameDateItems,
        {
          schedule_set_uuid: schedule.uuid,
          product_uuid: product.uuid,
          quantity: 1,
          time_slot_uuid: selectedSlots[schedule.uuid] || undefined,
        },
      ];
    });
  };

  const changeQuantity = (scheduleUuid: string, product: Product, delta: number, maxQuantity: number) => {
    setSelectedItems((prev) =>
      prev.map((item) => {
        if (item.schedule_set_uuid !== scheduleUuid || item.product_uuid !== product.uuid) return item;
        const nextQuantity = Math.min(maxQuantity, Math.max(1, item.quantity + delta));
        return { ...item, quantity: nextQuantity };
      }),
    );
  };

  const selectTimeSlot = (scheduleUuid: string, slotUuid: string) => {
    setSelectedSlots((prev) => ({ ...prev, [scheduleUuid]: slotUuid }));
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.schedule_set_uuid === scheduleUuid ? { ...item, time_slot_uuid: slotUuid } : item,
      ),
    );
  };

  const getReserveBlocker = () => {
    if (selectedItems.length === 0) return '예약할 상품을 선택해 주세요.';
    for (const uuid of selectedScheduleUuids) {
      const schedule = schedules.find((item) => item.uuid === uuid);
      if (schedule?.has_time_slots && !selectedSlots[uuid]) {
        return '방문 시간을 선택해야 하는 일정이 있습니다.';
      }
      if (schedule) {
        for (const group of groupProducts(schedule.products)) {
          if (!group.purchaseLimit) continue;
          const selectedQuantity = getSelectedGroupQuantity(schedule, group.key);
          if (selectedQuantity > group.purchaseLimit) {
            return `${group.name}은 그룹당 최대 ${group.purchaseLimit}개까지 선택할 수 있습니다.`;
          }
        }
      }
    }
    if (selectedScheduleUuids.length > 1) {
      const allBundleable = selectedScheduleUuids.every((uuid) => {
        const schedule = schedules.find((item) => item.uuid === uuid);
        return schedule?.can_bundle;
      });
      if (!allBundleable) return '선택한 일정 중 함께 예약할 수 없는 일정이 포함되어 있습니다.';
    }
    return '';
  };

  const reserveBlocker = getReserveBlocker();

  const handleReserve = async () => {
    if (checkingAgreement || submitting) return;
    setError('');
    setCheckingAgreement(true);
    let shouldSubmit = false;
    try {
      const data = await apiPublicGet<SettingValue>('/settings/reservation_agreement_markdown');
      if (data.value) {
        setAgreementContent(data.value);
        setShowAgreement(true);
        return;
      }
      shouldSubmit = true;
    } catch (err) {
      const message = getErrorMessage(err);
      setError(`예약 동의 메시지를 불러오지 못했습니다. ${message}`);
      return;
    } finally {
      setCheckingAgreement(false);
    }
    if (shouldSubmit) {
      void submitReservation();
    }
  };

  const submitReservation = async () => {
    if (!activeSaleDate) return;
    setSubmitting(true);
    setError('');
    setRequestProgress('예약 요청을 준비하고 있습니다.');
    setShowAgreement(false);

    try {
      const attemptSignature = JSON.stringify({
        sale_date: activeSaleDate,
        items: selectedItems,
      });
      const { idempotencyKey, storageKey } = getAttemptKey('create-reservation', attemptSignature);
      const body = {
        sale_date: activeSaleDate,
        idempotency_key: idempotencyKey,
        items: selectedItems.map((item) => ({
          schedule_set_uuid: item.schedule_set_uuid,
          product_uuid: item.product_uuid,
          quantity: item.quantity,
          time_slot_uuid: item.time_slot_uuid || undefined,
        })),
      };

      let response = await apiGatewayPost<ReservationRequestStatus | WaitingRoomResponse>('/reservation-requests', body);
      for (let attempt = 0; isWaitingRoomResponse(response) && attempt < 40; attempt += 1) {
        setWaitingRoom(response);
        setRequestProgress(waitingRoomMessage(response));
        await delay(Math.max(1, response.poll_after_seconds || response.retry_after_seconds || 3) * 1000);
        response = await apiGatewayPost<ReservationRequestStatus | WaitingRoomResponse>('/reservation-requests', body);
      }
      setWaitingRoom(null);

      if (!isReservationRequestStatus(response)) {
        throw new Error('예약 요청 대기 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.');
      }

      const finalStatus = await waitForReservationRequest(response, (status) => {
        setRequestProgress(requestProgressMessage(status));
      }, activeSaleDate);

      if (isRequestFailure(finalStatus.status)) {
        throw new Error(finalStatus.error_message || '예약 요청을 처리하지 못했습니다.');
      }

      setSuccessMessage('예약이 확정되었습니다. 내 예약에서 내용을 확인할 수 있습니다.');
      clearAttemptKey(storageKey);
      setSelectedItems([]);
      setSelectedSlots({});
      await fetchSchedules();
    } catch (err) {
      const message = getErrorMessage(err);
      if (isSameDateReservationError(message)) {
        setNoticeModal({
          title: '이미 같은 날짜의 예약이 있습니다.',
          message: '내 예약에서 기존 예약을 수정하거나 필요한 경우 취소할 수 있습니다.',
        });
        setError('');
      } else {
        setError(message);
      }
    } finally {
      await releaseWaitingRoom(activeSaleDate);
      setWaitingRoom(null);
      setRequestProgress('');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="예약 가능한 일정" description="열려 있는 판매 일정과 상품을 불러오고 있습니다.">
        <LoadingSpinner size="lg" message="일정을 불러오는 중..." />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="예약 가능한 일정"
      eyebrow={userInfo?.nickname ? `${userInfo.nickname}님` : undefined}
      description="날짜, 판매 일정, 상품과 방문 시간을 선택해 예약합니다."
    >
      <div className="stack-lg">
        {error && (
          <div className="message message-error">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="message message-success">
            <Check size={18} aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
        )}
        {requestProgress && (
          <div className="message message-info">
            <span>{requestProgress}</span>
          </div>
        )}

        {Object.keys(schedulesByDate).length === 0 ? (
          <div className="empty-state">
            <strong>현재 예약 가능한 일정이 없습니다.</strong>
            <span>새 일정이 열리면 이 화면에 표시됩니다.</span>
          </div>
        ) : (
          Object.entries(schedulesByDate).map(([date, dateSchedules]) => (
            <section key={date} className="date-section">
              <div className="date-section-header">
                <div>
                  <p className="eyebrow">판매 일자</p>
                  <h2>{formatSaleDate(date)}</h2>
                </div>
                {activeSaleDate === date && selectedItems.length > 0 ? (
                  <span className="badge badge-info">선택 중</span>
                ) : null}
              </div>

              <div className="stack">
                {dateSchedules.map((schedule) => (
                  <article key={schedule.uuid} className="surface schedule-block">
                    <div className="surface-header">
                      <div>
                        <h3>{schedule.title}</h3>
                        <p className="muted">
                          {completedScheduleUuids.has(schedule.uuid)
                            ? '이미 수령 완료 또는 노쇼 처리된 일정이라 다시 예약할 수 없습니다.'
                            : schedule.can_bundle
                              ? '같은 날짜의 다른 일정과 함께 예약할 수 있습니다.'
                              : '이 일정은 단독 예약만 가능합니다.'}
                        </p>
                      </div>
                      <span className={`badge ${schedule.reservation_open ? 'badge-success' : 'badge-warning'}`}>
                        {schedule.reservation_open ? '예약 가능' : '준비 중'}
                      </span>
                    </div>

                    {schedule.has_time_slots && schedule.time_slots.length > 0 ? (
                      <div className="surface-body">
                        <p className="form-label">방문 시간</p>
                        <div className="slot-grid">
                          {schedule.time_slots.map((slot) => {
                            const timeRemaining = visibleCount(slot.remaining_customers) ? slot.remaining_customers : undefined;
                            const showTimeRemaining = timeRemaining !== undefined;
                            const full = showTimeRemaining && timeRemaining <= 0;
                            const selected = selectedSlots[schedule.uuid] === slot.uuid;
                            return (
                              <button
                                key={slot.uuid}
                                type="button"
                                className={`slot-button ${selected ? 'selected' : ''}`}
                                disabled={full}
                                onClick={() => selectTimeSlot(schedule.uuid, slot.uuid)}
                              >
                                <strong>{slot.label}</strong>
                                {showTimeRemaining ? (
                                  <span>{full ? '이 시간은 예약이 모두 찼습니다' : `${timeRemaining}명 가능`}</span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="surface-body product-list">
                      {groupProducts(schedule.products).map((group) => {
                        const groupSelectedQuantity = getSelectedGroupQuantity(schedule, group.key);
                        const groupRemaining = group.purchaseLimit
                          ? Math.max(0, group.purchaseLimit - groupSelectedQuantity)
                          : Number.POSITIVE_INFINITY;
                        return (
                          <section key={group.key} className="product-group-section">
                            <div className="product-group-heading">
                              <div>
                                <h4>{group.name}</h4>
                                <p>
                                  {group.purchaseLimit
                                    ? `그룹당 최대 ${group.purchaseLimit}개까지 선택할 수 있습니다.`
                                    : '이 그룹은 별도 선택 제한이 없습니다.'}
                                </p>
                              </div>
                              {group.purchaseLimit ? (
                                <span className="constraint-pill">
                                  {groupSelectedQuantity}/{group.purchaseLimit}개 선택
                                </span>
                              ) : null}
                            </div>
                            {group.products.map((product) => {
                              const selected = isSelected(schedule.uuid, product.uuid);
                              const stockRemaining = visibleCount(product.stock_remaining) ? product.stock_remaining : undefined;
                              const stockQuantity = visibleCount(product.stock_quantity) ? product.stock_quantity : undefined;
                              const showStockRemaining = stockRemaining !== undefined;
                              const soldOut = showStockRemaining && stockRemaining <= 0;
                              const item = getSelectedItem(schedule.uuid, product.uuid);
                              const productLimit = maxQuantityFor(product);
                              const currentQuantity = item?.quantity ?? 0;
                              const maxSelectableQuantity = selected
                                ? Math.max(1, Math.min(productLimit, currentQuantity + groupRemaining))
                                : Math.min(productLimit, groupRemaining);
                              const groupLimitReached = !selected && group.purchaseLimit !== undefined && groupRemaining <= 0;
                              const completedBlocked = completedScheduleUuids.has(schedule.uuid);
                              const disabled = soldOut || !schedule.reservation_open || groupLimitReached || completedBlocked;
                              const productLimitLabel = getPositiveLimit(product.per_user_limit)
                                ? `상품당 최대 ${product.per_user_limit}개`
                                : `상품당 최대 ${productLimit}개`;
                              const stockLabel = showStockRemaining
                                ? stockQuantity
                                  ? `남은 수량 ${stockRemaining} / ${stockQuantity}`
                                  : `남은 수량 ${stockRemaining}`
                                : '';
                              const availabilityLabel = soldOut
                                ? '재고가 모두 소진되었습니다'
                                : completedBlocked
                                  ? '이미 수령 완료 또는 노쇼 처리된 일정입니다'
                                  : groupLimitReached
                                  ? '이 그룹의 선택 제한에 도달했습니다'
                                  : showStockRemaining
                                  ? stockLabel
                                  : '예약 가능 여부는 신청 후 확인됩니다.';

                              return (
                                <div key={product.uuid} className={`product-choice ${selected ? 'selected' : ''}`}>
                                  <button
                                    type="button"
                                    className="product-main"
                                    disabled={disabled}
                                    onClick={() => toggleProduct(schedule, product, !groupLimitReached)}
                                  >
                                    <span className="product-copy">
                                      <strong>{product.name}</strong>
                                      <span className="product-limit-list">
                                        <span>{productLimitLabel}</span>
                                        {showStockRemaining ? <span>{stockLabel}</span> : null}
                                      </span>
                                      <span className={soldOut || groupLimitReached ? 'form-error' : 'muted'}>
                                        {availabilityLabel}
                                      </span>
                                    </span>
                                    <span className={`choice-indicator ${selected ? 'checked' : ''}`}>
                                      {selected ? <Check size={16} aria-hidden="true" /> : null}
                                    </span>
                                  </button>
                                  {selected && item ? (
                                    <div className="quantity-row">
                                      <div className="quantity-control" aria-label={`${product.name} 수량`}>
                                        <button
                                          type="button"
                                          className="btn btn-secondary btn-sm"
                                          onClick={() => changeQuantity(schedule.uuid, product, -1, maxSelectableQuantity)}
                                          disabled={item.quantity <= 1}
                                        >
                                          <Minus size={15} aria-hidden="true" />
                                        </button>
                                        <strong>{item.quantity}</strong>
                                        <button
                                          type="button"
                                          className="btn btn-secondary btn-sm"
                                          onClick={() => changeQuantity(schedule.uuid, product, 1, maxSelectableQuantity)}
                                          disabled={item.quantity >= maxSelectableQuantity}
                                        >
                                          <Plus size={15} aria-hidden="true" />
                                        </button>
                                      </div>
                                      <span className="quantity-caption">이 상품은 최대 {maxSelectableQuantity}개까지 선택 가능</span>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </section>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {selectedItems.length > 0 && (
        <div className="bottom-action animate-slide-in">
          <div className="stack">
            {reserveBlocker ? <div className="message message-warning">{reserveBlocker}</div> : null}
            <button
              type="button"
              className="btn btn-primary btn-block btn-lg"
              onClick={handleReserve}
              disabled={Boolean(reserveBlocker) || checkingAgreement || submitting}
            >
              {checkingAgreement ? '확인 중...' : submitting ? '예약 처리 중...' : `${selectedProductCount}개 상품 예약하기`}
            </button>
          </div>
        </div>
      )}

      {showAgreement && (
        <>
          <div className="overlay" onClick={() => setShowAgreement(false)} />
          <div className="modal animate-scale-in" role="dialog" aria-modal="true" aria-labelledby="agreement-title">
            <div className="modal-header">
              <h3 id="agreement-title">예약 전 확인사항</h3>
            </div>
            <div className="modal-body">
              <MarkdownViewer content={agreementContent} />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAgreement(false)}>
                취소
              </button>
              <button type="button" className="btn btn-primary" onClick={submitReservation} disabled={submitting}>
                확인 후 예약
              </button>
            </div>
          </div>
        </>
      )}

      {noticeModal ? (
        <>
          <div className="overlay" onClick={() => setNoticeModal(null)} />
          <div className="modal animate-scale-in" role="dialog" aria-modal="true" aria-labelledby="schedule-notice-title">
            <div className="modal-header">
              <div>
                <p className="eyebrow">예약 안내</p>
                <h3 id="schedule-notice-title">{noticeModal.title}</h3>
              </div>
            </div>
            <div className="modal-body">
              <div className="message message-warning">
                <AlertCircle size={18} aria-hidden="true" />
                <span>{noticeModal.message}</span>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setNoticeModal(null)}>
                확인
              </button>
            </div>
          </div>
        </>
      ) : null}

      <WaitingRoomModal actionLabel="예약" response={waitingRoom} />
    </AppShell>
  );
}
