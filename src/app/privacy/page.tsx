'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { apiPublicText, getErrorMessage } from '@/lib/api';
import { SERVICE_NAME } from '@/lib/constants';
import Footer from '@/components/Layout/Footer';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import MarkdownViewer from '@/components/common/MarkdownViewer';

export default function PrivacyPage() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const text = await apiPublicText('/static/personal.md');
        setContent(text || '');
        setError('');
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    void fetchPolicy();
  }, []);

  return (
    <div className="page-container">
      <main className="page-content">
        <div className="auth-brand" style={{ marginBottom: 'var(--space-6)' }}>
          <span className="auth-brand-mark">
            <ShieldCheck size={22} aria-hidden="true" />
          </span>
          <h1>개인정보 처리방침</h1>
          <p>{SERVICE_NAME}에서 처리하는 개인정보 기준입니다.</p>
        </div>

        <section className="surface surface-body stack">
          {loading ? (
            <LoadingSpinner size="lg" message="개인정보 처리방침을 불러오는 중..." />
          ) : error ? (
            <div className="message message-error">
              <AlertCircle size={18} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : content ? (
            <div className="markdown-box">
              <MarkdownViewer content={content} />
            </div>
          ) : (
            <div className="empty-state">
              <strong>등록된 개인정보 처리방침이 없습니다.</strong>
              <span>운영자가 문서를 등록하면 이 화면에 표시됩니다.</span>
            </div>
          )}
          <Link href="/" className="btn btn-secondary">
            첫 화면으로
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
