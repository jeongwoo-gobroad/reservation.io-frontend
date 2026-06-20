'use client';

import { useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, getErrorMessage } from '@/lib/api';
import { isAdminLoggedIn, setAdminToken } from '@/lib/auth';
import type { AdminLoginResponse } from '@/lib/types';
import Footer from '@/components/Layout/Footer';

export default function AdminLoginPage() {
  const router = useRouter();
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAdminLoggedIn()) router.replace('/admin');
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await api<AdminLoginResponse>('/admin/login', {
        method: 'POST',
        body: {
          admin_id: adminId.trim(),
          password,
        },
        isAdmin: true,
        skipAuth: true,
      });
      setAdminToken(data.access_token);
      router.replace('/admin');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <main className="center-screen">
        <section className="auth-panel animate-fade-in-up" aria-labelledby="admin-login-title">
          <div className="auth-brand">
            <span className="auth-brand-mark"><ShieldCheck size={22} aria-hidden="true" /></span>
            <h1 id="admin-login-title">관리자 로그인</h1>
            <p>예약 운영 콘솔에 접근합니다.</p>
          </div>
          <form className="surface surface-body stack" onSubmit={handleSubmit}>
            {error && <div className="message message-error">{error}</div>}
            <div className="form-group">
              <label className="form-label" htmlFor="admin-id">아이디</label>
              <input
                id="admin-id"
                value={adminId}
                onChange={(event) => setAdminId(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="admin-password">비밀번호</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="message message-info">
              <LockKeyhole size={18} aria-hidden="true" />
              <span>반복 실패 시 접속이 제한될 수 있습니다.</span>
            </div>
            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? '확인 중...' : '로그인'}
            </button>
          </form>
        </section>
      </main>
      <Footer />
    </div>
  );
}
