'use client';

import { useEffect } from 'react';
import { CalendarCheck, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { KAKAO_REST_API_KEY, KAKAO_REDIRECT_URI, SERVICE_NAME } from '@/lib/constants';
import { isUserLoggedIn } from '@/lib/auth';
import Footer from '@/components/Layout/Footer';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (isUserLoggedIn()) {
      router.replace('/disclaimer');
    }
  }, [router]);

  const handleKakaoLogin = () => {
    if (!KAKAO_REST_API_KEY || !KAKAO_REDIRECT_URI) return;
    const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_API_KEY}&redirect_uri=${encodeURIComponent(KAKAO_REDIRECT_URI)}&response_type=code`;
    window.location.href = kakaoAuthUrl;
  };

  return (
    <div className="page-container">
      <main className="center-screen">
        <section className="auth-panel animate-fade-in-up" aria-labelledby="login-title">
          <div className="auth-brand">
            <span className="auth-brand-mark">R</span>
            <h1 id="login-title">{SERVICE_NAME}</h1>
            <p>빠르게 예약하고, 현장에서 간단히 확인합니다.</p>
          </div>
          <div className="surface surface-body stack">
            <div className="message message-info">
              <CalendarCheck size={18} aria-hidden="true" />
              <span>카카오 로그인 후 예약 가능한 일정과 방문 확인증을 이용할 수 있습니다.</span>
            </div>
            {!KAKAO_REST_API_KEY || !KAKAO_REDIRECT_URI ? (
              <div className="message message-warning">
                <span>카카오 로그인 환경변수가 아직 설정되지 않았습니다.</span>
              </div>
            ) : null}
            <button
              type="button"
              className="btn btn-kakao"
              onClick={handleKakaoLogin}
              disabled={!KAKAO_REST_API_KEY || !KAKAO_REDIRECT_URI}
            >
              <MessageCircle size={19} aria-hidden="true" />
              카카오 로그인
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
