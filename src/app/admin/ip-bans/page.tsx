'use client';

import { ShieldOff } from 'lucide-react';
import { useRequireAdmin } from '@/lib/useAuthGuard';
import AppShell from '@/components/Layout/AppShell';

export default function AdminIpBansPage() {
  useRequireAdmin();

  return (
    <AppShell
      variant="admin"
      title="IP 관리 비활성화"
      description="IP 기반 차단은 프록시 환경에서 오탐을 만들 수 있어 운영 콘솔에서 사용하지 않습니다."
    >
      <section className="surface">
        <div className="surface-header">
          <div>
            <p className="eyebrow">비활성화됨</p>
            <h2>IP 기반 밴은 사용하지 않습니다.</h2>
          </div>
          <ShieldOff size={22} aria-hidden="true" />
        </div>
        <div className="surface-body stack">
          <div className="message message-info">
            반복 요청 방어는 Vercel Proxy와 Redis Sliding Window Counter에서 처리합니다.
          </div>
          <p className="muted">
            프록시 뒤에서는 실제 사용자 IP와 백엔드가 보는 IP가 달라질 수 있으므로, 관리자 로그인 실패를 IP 밴으로
            연결하지 않습니다. 고객 예약 제한은 노쇼/예약 제한 메뉴에서 사용자 기준으로 관리합니다.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
