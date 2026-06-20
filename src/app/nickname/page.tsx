'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserRound } from 'lucide-react';
import { apiPatch } from '@/lib/api';
import { getUserInfo, setUserInfo } from '@/lib/auth';
import { getErrorMessage } from '@/lib/api';
import Footer from '@/components/Layout/Footer';

export default function NicknamePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setError('닉네임을 입력해 주세요.');
      return;
    }
    if (nickname.trim().length < 2) {
      setError('닉네임은 2글자 이상이어야 합니다.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await apiPatch('/users/me/nickname', { nickname: nickname.trim() });
      const userInfo = getUserInfo();
      if (userInfo) {
        setUserInfo({ ...userInfo, nickname: nickname.trim() });
      }
      router.replace('/disclaimer');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <main className="center-screen">
        <section className="auth-panel animate-fade-in-up" aria-labelledby="nickname-title">
          <div className="auth-brand">
            <span className="auth-brand-mark"><UserRound size={22} aria-hidden="true" /></span>
            <h1 id="nickname-title">닉네임 설정</h1>
            <p>예약 내역과 현장 확인에 표시될 이름입니다.</p>
          </div>
          <div className="surface surface-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="nickname">닉네임</label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="닉네임을 입력하세요"
                maxLength={20}
                autoFocus
              />
              {error && <p className="form-error">{error}</p>}
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={loading}
            >
              {loading ? '저장 중...' : '시작하기'}
            </button>
          </form>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
