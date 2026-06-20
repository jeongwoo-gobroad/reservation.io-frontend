'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiGet, getErrorMessage } from '@/lib/api';
import { isUserLoggedIn } from '@/lib/auth';
import type { VisitToken } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import LoadingSpinner from '@/components/common/LoadingSpinner';

interface TokenWithQr extends VisitToken {
  qrDataUrl?: string;
}

export default function VisitPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState<TokenWithQr[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<VisitToken[]>('/users/me/visit-tokens');
      const withQr = await Promise.all(
        data.map(async (token) => ({
          ...token,
          qrDataUrl: await QRCode.toDataURL(token.qr_hash, {
            margin: 1,
            width: 220,
            color: {
              dark: '#111111',
              light: '#ffffff',
            },
          }),
        })),
      );
      setTokens(withQr);
      setError('');
      setTick(0);
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
    void Promise.resolve().then(fetchTokens);
  }, [fetchTokens, router]);

  useEffect(() => {
    if (tokens.length === 0) return;
    const interval = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [tokens.length]);

  const secondsLeft = useMemo(() => {
    if (tokens.length === 0) return 0;
    return Math.max(0, Math.min(...tokens.map((token) => token.expires_in_seconds)) - tick);
  }, [tick, tokens]);

  useEffect(() => {
    if (!loading && tokens.length > 0 && secondsLeft <= 0) {
      void Promise.resolve().then(fetchTokens);
    }
  }, [fetchTokens, loading, secondsLeft, tokens.length]);

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
      description="현장에서 관리자에게 QR 또는 수동 코드를 보여주세요."
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
            <span>방문 확인증은 판매 당일 예약이 있을 때 표시됩니다.</span>
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
                  style={{ width: `${Math.max(0, Math.min(100, (secondsLeft / 30) * 100))}%` }}
                />
              </div>
            </div>

            <div className="dashboard-grid">
              {tokens.map((token) => (
                <section key={token.reservation_uuid} className="surface span-6">
                  <div className="surface-body stack" style={{ alignItems: 'center', textAlign: 'center' }}>
                    {token.qrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="qr-image" src={token.qrDataUrl} alt="방문 확인 QR" />
                    ) : null}
                    <div className="stack">
                      <span className="muted">수동 코드</span>
                      <span className="manual-code">{token.manual_code}</span>
                    </div>
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
