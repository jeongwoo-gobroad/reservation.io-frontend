'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Network,
  QrCode,
  RefreshCw,
  Settings,
  Store,
} from 'lucide-react';
import { apiGet, apiPost, getErrorMessage } from '@/lib/api';
import { compactNumber, formatDateTime, formatSaleDate } from '@/lib/format';
import { useRequireAdmin } from '@/lib/useAuthGuard';
import type { DayCloseResult, PendingDayClose } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const menuItems = [
  { href: '/admin/visits', title: '방문 확인', description: 'QR 스캔과 수동 코드 확인', icon: <QrCode size={20} /> },
  { href: '/admin/schedules', title: '판매 일정 만들기', description: '날짜, 상품, 재고, 방문 시간 관리', icon: <CalendarDays size={20} /> },
  { href: '/admin/reservations', title: '현재 예약 현황', description: '날짜와 닉네임으로 예약 조회', icon: <ClipboardCheck size={20} /> },
  { href: '/admin/banned-users', title: '노쇼/예약 제한', description: '예약 제한 고객과 기준 관리', icon: <Ban size={20} /> },
  { href: '/admin/ip-bans', title: 'IP 관리', description: '관리자 접속 제한 IP 관리', icon: <Network size={20} /> },
  { href: '/admin/settings', title: '안내문 관리', description: '로그인 안내와 예약 동의 문구', icon: <FileText size={20} /> },
];

export default function AdminDashboardPage() {
  useRequireAdmin();
  const [pendingDays, setPendingDays] = useState<PendingDayClose[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [closeTarget, setCloseTarget] = useState<string | 'today' | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DayCloseResult | null>(null);

  const fetchPendingDays = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<PendingDayClose[]>('/admin/day-close/pending', true);
      setPendingDays(data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchPendingDays);
  }, [fetchPendingDays]);

  const handleCloseDay = async () => {
    if (!closeTarget) return;
    setClosing(true);
    setError('');
    try {
      const body = closeTarget === 'today'
        ? { confirm_no_show: true }
        : { sale_date: closeTarget, confirm_no_show: true };
      const data = await apiPost<DayCloseResult>('/admin/day-close', body, true);
      setResult(data);
      setCloseTarget(null);
      fetchPendingDays();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setClosing(false);
    }
  };

  return (
    <AppShell
      variant="admin"
      title="관리자 메인"
      description="마감이 필요한 영업일과 주요 운영 메뉴를 한 화면에서 확인합니다."
      actions={
        <button type="button" className="btn btn-secondary" onClick={fetchPendingDays}>
          <RefreshCw size={17} aria-hidden="true" />
          새로고침
        </button>
      }
    >
      <div className="stack-lg">
        {error && <div className="message message-error">{error}</div>}
        {result && (
          <div className="message message-success">
            {formatSaleDate(result.sale_date)} 마감 완료
            {result.closed_at ? ` · 처리 시각 ${formatDateTime(result.closed_at)}` : ''}
          </div>
        )}

        <section className="surface">
          <div className="surface-header">
            <div>
              <p className="eyebrow">우선 확인</p>
              <h2>마감이 필요한 지난 영업일</h2>
            </div>
            <span className={`badge ${pendingDays.length > 0 ? 'badge-warning' : 'badge-success'}`}>
              {pendingDays.length > 0 ? `${pendingDays.length}일 필요` : '정리됨'}
            </span>
          </div>
          <div className="surface-body">
            {loading ? (
              <LoadingSpinner message="미마감 영업일을 확인하는 중..." />
            ) : pendingDays.length === 0 ? (
              <div className="empty-state">
                <strong>마감이 필요한 지난 영업일이 없습니다.</strong>
                <span>영업 마감 기록이 모두 정리된 상태입니다.</span>
              </div>
            ) : (
              pendingDays.map((day) => (
                <div key={day.sale_date} className="list-row">
                  <div className="row-main">
                    <p className="row-title">{formatSaleDate(day.sale_date)}</p>
                    <div className="row-meta">
                      <span>일정 {compactNumber(day.schedule_count)}개</span>
                      <span>미방문 예약 {compactNumber(day.reserved_reservations)}건</span>
                      <span>노쇼 예상 고객 {compactNumber(day.expected_no_show_users)}명</span>
                    </div>
                  </div>
                  <button type="button" className="btn btn-warning" onClick={() => setCloseTarget(day.sale_date)}>
                    마감 처리
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="dashboard-grid">
          {menuItems.map((item) => (
            <Link key={item.href} href={item.href} className="surface surface-body span-4 stack">
              <span style={{ color: 'var(--color-accent)' }}>{item.icon}</span>
              <strong>{item.title}</strong>
              <span className="muted">{item.description}</span>
            </Link>
          ))}

          <aside className="surface span-12">
            <div className="surface-header">
              <div>
                <p className="eyebrow">하루 종료</p>
                <h2>당일 영업 마감</h2>
              </div>
              <Store size={22} aria-hidden="true" />
            </div>
            <div className="surface-body stack">
              <p className="muted">
                오늘 방문 확인이 모두 끝난 뒤 누릅니다. 아직 방문 완료되지 않은 예약은 노쇼 처리됩니다.
              </p>
              <button type="button" className="btn btn-warning btn-block" onClick={() => setCloseTarget('today')}>
                당일 영업 마감
              </button>
              <Link href="/admin/settings" className="btn btn-secondary btn-block">
                <Settings size={17} aria-hidden="true" />
                운영 문구 확인
              </Link>
            </div>
          </aside>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(closeTarget)}
        title="영업일을 마감할까요?"
        message={
          '미방문 고객은 노쇼 처리됩니다.\n이 작업은 해당 날짜를 마감 완료로 기록합니다.\n정말 마감하시겠습니까?'
        }
        confirmText="마감 처리"
        variant="warning"
        loading={closing}
        onConfirm={handleCloseDay}
        onCancel={() => setCloseTarget(null)}
      />
    </AppShell>
  );
}
