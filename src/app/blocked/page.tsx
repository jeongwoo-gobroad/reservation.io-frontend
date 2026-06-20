'use client';

import { useEffect, useState } from 'react';
import { Ban, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPublicGet } from '@/lib/api';
import { getUserInfo, isUserLoggedIn, logoutUser } from '@/lib/auth';
import type { BlockStatus, SettingValue } from '@/lib/types';
import Footer from '@/components/Layout/Footer';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import MarkdownViewer from '@/components/common/MarkdownViewer';

const fallbackMessage = '현재 접속이 제한되어 있습니다. 매장 관리자에게 문의해 주세요.';

export default function BlockedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(fallbackMessage);
  const [nickname, setNickname] = useState('');

  useEffect(() => {
    const load = async () => {
      const cached = getUserInfo();
      setNickname(cached?.nickname || '');

      try {
        if (isUserLoggedIn()) {
          const status = await apiGet<BlockStatus>('/users/me/block-status');
          setNickname(status.nickname || cached?.nickname || '');
          if (status.message_markdown) {
            setMessage(status.message_markdown);
          }
          if (!status.blocked) {
            router.replace('/schedules');
            return;
          }
        } else {
          const setting = await apiPublicGet<SettingValue>('/settings/blocked_user_message_markdown');
          setMessage(setting.value || fallbackMessage);
        }
      } catch {
        try {
          const setting = await apiPublicGet<SettingValue>('/settings/blocked_user_message_markdown');
          setMessage(setting.value || fallbackMessage);
        } catch {
          setMessage(fallbackMessage);
        }
      } finally {
        setLoading(false);
      }
    };

    void Promise.resolve().then(load);
  }, [router]);

  return (
    <div className="page-container">
      <main className="center-screen">
        <section className="auth-panel animate-fade-in-up" aria-labelledby="blocked-title">
          <div className="auth-brand">
            <span className="auth-brand-mark">
              <Ban size={22} aria-hidden="true" />
            </span>
            <h1 id="blocked-title">접속 제한 안내</h1>
            <p>{nickname ? `${nickname}님 계정의 현재 접속이 제한되어 있습니다.` : '현재 접속이 제한되어 있습니다.'}</p>
          </div>
          <div className="surface surface-body stack">
            {loading ? (
              <LoadingSpinner message="접속 제한 상태를 확인하는 중..." />
            ) : (
              <div className="markdown-content">
                <MarkdownViewer content={message} />
              </div>
            )}
            <button type="button" className="btn btn-secondary btn-block" onClick={logoutUser}>
              <LogOut size={17} aria-hidden="true" />
              로그아웃
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
