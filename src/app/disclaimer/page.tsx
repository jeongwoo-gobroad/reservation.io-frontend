'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { isUserLoggedIn } from '@/lib/auth';
import MarkdownViewer from '@/components/common/MarkdownViewer';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import Footer from '@/components/Layout/Footer';

export default function DisclaimerPage() {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isUserLoggedIn()) {
      router.replace('/');
      return;
    }
    const fetchDisclaimer = async () => {
      try {
        const data = await apiGet<{ value: string }>('/settings/disclaimer_markdown', false);
        setContent(data.value || '');
      } catch {
        setContent('');
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

  // If no disclaimer content, skip to schedules
  if (!content) {
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
          <button
            className="btn btn-primary btn-block btn-lg"
            disabled={!checked}
            onClick={handleConfirm}
          >
            확인
          </button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
