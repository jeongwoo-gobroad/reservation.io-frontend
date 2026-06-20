'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, FileText } from 'lucide-react';
import { apiPublicGet, getErrorMessage } from '@/lib/api';
import { isUserLoggedIn } from '@/lib/auth';
import MarkdownViewer from '@/components/common/MarkdownViewer';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import Footer from '@/components/Layout/Footer';

export default function DisclaimerPage() {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isUserLoggedIn()) {
      router.replace('/');
      return;
    }
    const fetchDisclaimer = async () => {
      try {
        const data = await apiPublicGet<{ value: string }>('/settings/disclaimer_markdown');
        setContent(data.value || '');
        setError('');
      } catch (err) {
        setContent('');
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    fetchDisclaimer();
  }, [router]);

  const handleConfirm = () => {
    router.replace('/schedules');
  };

  if (loading) {
    return (
      <div className="page-container">
        <LoadingSpinner size="lg" message="안내문을 불러오는 중..." />
        <Footer />
      </div>
    );
  }

  if (!content && !error) {
    if (typeof window !== 'undefined') router.replace('/schedules');
    return null;
  }

  return (
    <div className="page-container">
      <main className="center-screen">
        <section className="auth-panel animate-fade-in-up" aria-labelledby="disclaimer-title">
          <div className="auth-brand">
            <span className="auth-brand-mark"><FileText size={22} aria-hidden="true" /></span>
            <h1 id="disclaimer-title">안내문</h1>
            <p>예약 전 확인이 필요한 운영 안내입니다.</p>
          </div>
          <div className="surface surface-body stack">
            {error ? (
              <div className="message message-error">
                <AlertCircle size={18} aria-hidden="true" />
                <span>안내문을 불러오지 못했습니다. {error}</span>
              </div>
            ) : (
              <>
                <div className="markdown-box">
                  <MarkdownViewer content={content} />
                </div>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                  />
                  <span>위 내용을 확인했습니다</span>
                </label>
              </>
            )}
            <button
              className="btn btn-primary btn-block btn-lg"
              disabled={!error && !checked}
              onClick={handleConfirm}
            >
              {error ? '예약 화면으로 이동' : '확인'}
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
