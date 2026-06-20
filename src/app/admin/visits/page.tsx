'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, QrCode, RefreshCw, Search, Square } from 'lucide-react';
import { apiGet, apiPost, getErrorMessage } from '@/lib/api';
import { formatDateTime, formatSaleDate, reservationKey, toQueryString } from '@/lib/format';
import { useRequireAdmin } from '@/lib/useAuthGuard';
import type { AdminReservation, RecentVisit, VisitScanResult } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import LoadingSpinner from '@/components/common/LoadingSpinner';

function extractReservations(result: VisitScanResult | null): AdminReservation[] {
  if (!result) return [];
  if (result.reservations?.length) return result.reservations;
  if (result.items?.length) return result.items;
  if (result.reservation) return [result.reservation];
  return [];
}

export default function AdminVisitsPage() {
  useRequireAdmin();
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [scanResult, setScanResult] = useState<VisitScanResult | null>(null);
  const [recent, setRecent] = useState<RecentVisit[]>([]);
  const [recentLimit, setRecentLimit] = useState(10);
  const [recentOffset, setRecentOffset] = useState(0);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadRecent = useCallback(async (offset = 0, append = false) => {
    setLoadingRecent(true);
    try {
      const data = await apiGet<RecentVisit[]>(
        `/admin/visits/recent${toQueryString({ offset, limit: recentLimit })}`,
        true,
      );
      setRecent((prev) => (append ? [...prev, ...data] : data));
      setRecentOffset(offset);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingRecent(false);
    }
  }, [recentLimit]);

  useEffect(() => {
    void Promise.resolve().then(() => loadRecent(0, false));
  }, [loadRecent]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) {
      setScanning(false);
      return;
    }
    try {
      await scanner.stop();
      scanner.clear();
    } catch {
      // Camera can already be stopped by browser permissions or route changes.
    } finally {
      scannerRef.current = null;
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const scanToken = async (token: string) => {
    const normalized = token.trim();
    if (!normalized) {
      setError('QR 또는 수동 코드를 입력해 주세요.');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const data = await apiPost<VisitScanResult>('/admin/visits/scan', {
        token: normalized,
        token_type: 'auto',
      }, true);
      setScanResult(data);
      setManualToken('');
      setMessage('방문 확인 정보를 찾았습니다. 상품 제공 후 완료 처리해 주세요.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const startScanner = async () => {
    setError('');
    setMessage('');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      setScanning(true);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          await stopScanner();
          scanToken(decodedText);
        },
        () => undefined,
      );
    } catch (err) {
      setScanning(false);
      setError(err instanceof Error ? err.message : '카메라를 시작할 수 없습니다.');
    }
  };

  const completeVisit = async () => {
    const reservationUuids = extractReservations(scanResult).map(reservationKey).filter(Boolean);
    if (reservationUuids.length === 0) {
      setError('완료 처리할 예약을 찾을 수 없습니다.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiPost('/admin/visits/complete', { reservation_uuids: reservationUuids }, true);
      setMessage('제공 완료 처리되었습니다.');
      setScanResult(null);
      loadRecent(0, false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const reservations = extractReservations(scanResult);

  return (
    <AppShell
      variant="admin"
      title="방문 확인"
      description="현장에서 QR을 스캔하거나 수동 코드 12자리를 입력합니다."
      actions={
        <button type="button" className="btn btn-secondary" onClick={() => loadRecent(0, false)}>
          <RefreshCw size={17} aria-hidden="true" />
          최근 내역 새로고침
        </button>
      }
    >
      <div className="dashboard-grid">
        <section className="surface span-6">
          <div className="surface-header">
            <div>
              <p className="eyebrow">스캔</p>
              <h2>QR 스캔</h2>
            </div>
            <QrCode size={22} aria-hidden="true" />
          </div>
          <div className="surface-body stack">
            <div id="qr-reader" className="scanner-box" />
            <div className="heading-actions">
              {scanning ? (
                <button type="button" className="btn btn-secondary" onClick={stopScanner}>
                  <Square size={17} aria-hidden="true" />
                  스캔 중지
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={startScanner}>
                  <Camera size={17} aria-hidden="true" />
                  QR 스캔 시작
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="surface span-6">
          <div className="surface-header">
            <div>
              <p className="eyebrow">대체 입력</p>
              <h2>수동 코드 입력</h2>
            </div>
          </div>
          <form
            className="surface-body stack"
            onSubmit={(event) => {
              event.preventDefault();
              scanToken(manualToken);
            }}
          >
            <div className="form-group">
              <label className="form-label" htmlFor="manual-token">수동 코드 또는 QR 값</label>
              <input
                id="manual-token"
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
                placeholder="12자리 수동 코드를 입력하세요"
                autoComplete="off"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              <Search size={17} aria-hidden="true" />
              확인
            </button>
            {error && <div className="message message-error">{error}</div>}
            {message && <div className="message message-success">{message}</div>}
          </form>
        </section>

        <section className="surface span-12">
          <div className="surface-header">
            <div>
              <p className="eyebrow">결과</p>
              <h2>확인된 예약</h2>
            </div>
          </div>
          <div className="surface-body">
            {reservations.length === 0 ? (
              <div className="empty-state">
                <strong>아직 확인된 예약이 없습니다.</strong>
                <span>QR 스캔 또는 수동 코드 입력 후 이곳에 표시됩니다.</span>
              </div>
            ) : (
              <div className="stack">
                {reservations.map((reservation) => (
                  <div key={reservationKey(reservation)} className="list-row">
                    <div className="row-main">
                      <p className="row-title">{reservation.nickname || scanResult?.nickname || '고객'}</p>
                      <div className="row-meta">
                        <span>{formatSaleDate(reservation.sale_date)}</span>
                        {reservation.schedule_title ? <span>{reservation.schedule_title}</span> : null}
                        {reservation.product_name ? <span>{reservation.product_name}</span> : null}
                        {reservation.time_slot_label ? <span>방문 시간 {reservation.time_slot_label}</span> : null}
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn btn-success btn-block" onClick={completeVisit} disabled={submitting}>
                  <CheckCircle2 size={17} aria-hidden="true" />
                  제공 완료
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="surface span-12">
          <div className="surface-header">
            <div>
              <p className="eyebrow">복구</p>
              <h2>최근 확인 내역</h2>
            </div>
            <div className="heading-actions">
              <select
                aria-label="최근 확인 내역 개수"
                value={recentLimit}
                onChange={(event) => {
                  setRecentLimit(Number(event.target.value));
                  setRecentOffset(0);
                }}
              >
                {[5, 10, 20, 30, 50].map((value) => (
                  <option key={value} value={value}>{value}개</option>
                ))}
              </select>
            </div>
          </div>
          <div className="surface-body">
            {loadingRecent ? (
              <LoadingSpinner message="최근 내역을 불러오는 중..." />
            ) : recent.length === 0 ? (
              <div className="empty-state">
                <strong>최근 확인 내역이 없습니다.</strong>
                <span>방문 확인 완료 후 이곳에 기록됩니다.</span>
              </div>
            ) : (
              <div className="stack">
                {recent.map((visit, index) => (
                  <div key={`${visit.reservation_uuid}-${index}`} className="list-row">
                    <div className="row-main">
                      <p className="row-title">{visit.nickname || '고객'}</p>
                      <div className="row-meta">
                        <span>{formatSaleDate(visit.sale_date)}</span>
                        {visit.schedule_title ? <span>{visit.schedule_title}</span> : null}
                        {visit.product_name ? <span>{visit.product_name}</span> : null}
                        {visit.time_slot_label ? <span>방문 시간 {visit.time_slot_label}</span> : null}
                        <span>확인 일시: {formatDateTime(visit.visited_at || visit.completed_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => loadRecent(recentOffset + recentLimit, true)}
                >
                  이전 {recentLimit}개 더 불러오기
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
