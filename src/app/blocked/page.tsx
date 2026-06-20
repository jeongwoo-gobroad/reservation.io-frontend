'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import { isUserLoggedIn } from '@/lib/auth';
import Footer from '@/components/Layout/Footer';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function BlockedPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(isUserLoggedIn() ? '/schedules' : '/');
  }, [router]);

  return (
    <div className="page-container">
      <main className="center-screen">
        <section className="auth-panel animate-fade-in-up" aria-labelledby="blocked-disabled-title">
          <div className="auth-brand">
            <span className="auth-brand-mark">
              <ShieldOff size={22} aria-hidden="true" />
            </span>
            <h1 id="blocked-disabled-title">접속 제한 화면을 사용하지 않습니다.</h1>
            <p>반복 요청 방어는 Vercel Proxy에서 처리합니다. 정상 화면으로 이동합니다.</p>
          </div>
          <div className="surface surface-body">
            <LoadingSpinner message="이동하는 중..." />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
