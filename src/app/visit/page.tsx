'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, getErrorMessage } from '@/lib/api';
import { isUserLoggedIn } from '@/lib/auth';
import type { ManualVisitCode, VisitToken, VisitTokenResponse } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import LoadingSpinner from '@/components/common/LoadingSpinner';

interface TokenWithQr extends VisitToken {
  qrDataUrl?: string;
}

export default function VisitPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState<TokenWithQr[]>([]);
  const [manualCodes, setManualCodes] = useState<Record<string, ManualVisitCode>>({});
  const [manualLoading, setManualLoading] = useState<Record<string, boolean>>({});
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  const fetchTokens = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    setLoading(true);
    try {
      const data = await apiGet<VisitTokenResponse | VisitToken[]>('/users/me/visit-tokens');
      const tokenList = Array.isArray(data) ? data : data.tokens;
      const withQr = await Promise.all(
        tokenList.map(async (token) => ({
          ...token,
          qrDataUrl: await QRCode.toDataURL(token.qr_hash, {
            margin: 1,
            width: 260,
            color: {
              dark: '#111111',
              light: '#ffffff',
            },
          }),
        })),
      );
      setTokens(withQr);
      setNotice(Array.isArray(data) ? '' : data.message || '');
      setManualCodes((prev) => {
        const activeReservationUuids = new Set(tokenList.map((token) => token.reservation_uuid));
        return Object.fromEntries(Object.entries(prev).filter(([uuid]) => activeReservationUuids.has(uuid)));
      });
      setError('');
      setTick(0);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const issueManualCode = async (reservationUuid: string) => {
    setManualLoading((prev) => ({ ...prev, [reservationUuid]: true }));
    setManualErrors((prev) => ({ ...prev, [reservationUuid]: '' }));
    try {
      const data = await apiPost<ManualVisitCode>('/users/me/visit-manual-code', {
        reservation_uuid: reservationUuid,
      });
      setManualCodes((prev) => ({ ...prev, [reservationUuid]: data }));
    } catch (err) {
      setManualErrors((prev) => ({ ...prev, [reservationUuid]: getErrorMessage(err) }));
    } finally {
      setManualLoading((prev) => ({ ...prev, [reservationUuid]: false }));
    }
  };

  useEffect(() => {
    if (!isUserLoggedIn()) {
      router.replace('/');
      return;
    }
    void Promise.resolve().then(fetchTokens);
  }, [fetchTokens, router]);

  useEffect(() => {
    if (tokens.length === 0) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setTick((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [tokens.length]);

  const secondsLeft = useMemo(() => {
    if (tokens.length === 0) return 0;
    return Math.max(0, Math.min(...tokens.map((token) => token.expires_in_seconds)) - tick);
  }, [tick, tokens]);

  const refreshWindow = useMemo(() => {
    if (tokens.length === 0) return 1;
    return Math.max(1, Math.min(...tokens.map((token) => token.expires_in_seconds)));
  }, [tokens]);

  useEffect(() => {
    if (!loading && tokens.length > 0 && secondsLeft <= 0) {
      void Promise.resolve().then(fetchTokens);
    }
  }, [fetchTokens, loading, secondsLeft, tokens.length]);

  useEffect(() => {
    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') {
        void Promise.resolve().then(fetchTokens);
      }
    };
    document.addEventListener('visibilitychange', refreshOnVisible);
    return () => document.removeEventListener('visibilitychange', refreshOnVisible);
  }, [fetchTokens]);

  if (loading && tokens.length === 0) {
    return (
      <AppShell title="방문 확인증" description="오늘 예약의 방문 확인 정보를 준비하고 있습니다.">
        <LoadingSpinner size="lg" message="방문 확인증을 불러오는 중..." />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="방문 확인증"
      description="현장에서는 QR을 먼저 보여주시고, QR 인식이 어려울 때만 수동 코드를 발급해 주세요."
      actions={
        <button type="button" className="btn btn-secondary" onClick={fetchTokens}>
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

        {tokens.length === 0 ? (
          <div className="empty-state">
            <strong>오늘 사용할 방문 확인증이 없습니다.</strong>
            <span>{notice || '방문 확인증은 판매 당일 예약이 있을 때 표시됩니다.'}</span>
          </div>
        ) : (
          <>
            <div className="surface surface-body stack">
              <div className="message message-info">
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>다음 코드 갱신까지 {secondsLeft}초 남았습니다.</span>
              </div>
              <div className="progress-track" aria-hidden="true">
                <div
                  className="progress-bar"
                  style={{ width: `${Math.max(0, Math.min(100, (secondsLeft / refreshWindow) * 100))}%` }}
                />
              </div>
            </div>

            <div className="dashboard-grid">
              {tokens.map((token) => (
                <section key={token.reservation_uuid} className="surface span-6 visit-token-card">
                  <div className="surface-body visit-token-body">
                    <div className="visit-token-product">{token.product_name || '예약 상품'}</div>
                    {token.qrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="qr-image" src={token.qrDataUrl} alt={`${token.product_name || '예약 상품'} 방문 확인 QR`} />
                    ) : null}
                    <button
                      type="button"
                      className="manual-code-trigger"
                      onClick={() => issueManualCode(token.reservation_uuid)}
                      disabled={manualLoading[token.reservation_uuid]}
                    >
                      {manualLoading[token.reservation_uuid]
                        ? '수동 코드를 발급하는 중...'
                        : 'QR코드 인식이 어려워요(수동 코드 생성)'}
                    </button>
                    {manualErrors[token.reservation_uuid] ? (
                      <div className="message message-error">{manualErrors[token.reservation_uuid]}</div>
                    ) : null}
                    {manualCodes[token.reservation_uuid] ? (
                      <div className="manual-code-box">
                        <span className="muted">수동 코드</span>
                        <span className="manual-code">{manualCodes[token.reservation_uuid].manual_code}</span>
                      </div>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
