'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { setUserToken, setUserInfo } from '@/lib/auth';
import { KAKAO_REDIRECT_URI } from '@/lib/constants';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import Footer from '@/components/Layout/Footer';

interface ExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in_seconds: number;
  user_uuid: string;
  kakao_id: string;
  nickname: string;
}

function KakaoCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      void Promise.resolve().then(() => setError('로그인에 필요한 인증 코드가 없습니다.'));
      return;
    }

    const exchange = async () => {
      try {
        const data = await api<ExchangeResponse>('/auth/kakao/exchange', {
          method: 'POST',
          body: {
            code,
            redirect_uri: KAKAO_REDIRECT_URI,
          },
          skipAuth: true,
        });

        setUserToken(data.access_token);
        setUserInfo({
          user_uuid: data.user_uuid,
          kakao_id: data.kakao_id,
          nickname: data.nickname,
        });

        router.replace(data.nickname ? '/disclaimer' : '/nickname');
      } catch (err) {
        setError(err instanceof Error ? err.message : '로그인 처리 중 오류가 발생했습니다.');
      }
    };

    exchange();
  }, [router, searchParams]);

  if (!error) {
    return <LoadingSpinner size="lg" message="로그인 처리 중..." />;
  }

  return (
    <div className="surface surface-body stack" style={{ maxWidth: 420, width: '100%' }}>
      <div className="message message-error">
        <AlertCircle size={18} aria-hidden="true" />
        <span>{error}</span>
      </div>
      <button type="button" className="btn btn-primary btn-block" onClick={() => router.replace('/')}>
        로그인 화면으로 돌아가기
      </button>
    </div>
  );
}

export default function KakaoCallbackPage() {
  return (
    <div className="page-container">
      <main className="center-screen">
        <Suspense fallback={<LoadingSpinner size="lg" message="로그인 처리 중..." />}>
          <KakaoCallbackContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
