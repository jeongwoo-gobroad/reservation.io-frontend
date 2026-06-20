'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, RefreshCw, Save } from 'lucide-react';
import { apiGet, apiPut, getErrorMessage } from '@/lib/api';
import { useRequireAdmin } from '@/lib/useAuthGuard';
import type { SettingValue } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import MarkdownViewer from '@/components/common/MarkdownViewer';

type SettingKey = 'disclaimer_markdown' | 'reservation_agreement_markdown';

const labels: Record<SettingKey, { title: string; description: string }> = {
  disclaimer_markdown: {
    title: '로그인 안내문',
    description: '손님이 로그인할 때 매번 확인하는 안내입니다.',
  },
  reservation_agreement_markdown: {
    title: '예약 동의 메시지',
    description: '예약 버튼을 누르기 전 다시 확인하는 내용입니다.',
  },
};

export default function AdminSettingsPage() {
  useRequireAdmin();
  const [values, setValues] = useState<Record<SettingKey, string>>({
    disclaimer_markdown: '',
    reservation_agreement_markdown: '',
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<SettingKey | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [disclaimer, agreement] = await Promise.all([
        apiGet<SettingValue>('/admin/settings/disclaimer_markdown', true),
        apiGet<SettingValue>('/admin/settings/reservation_agreement_markdown', true),
      ]);
      setValues({
        disclaimer_markdown: disclaimer.value || '',
        reservation_agreement_markdown: agreement.value || '',
      });
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchSettings);
  }, [fetchSettings]);

  const saveSetting = async (key: SettingKey) => {
    setSavingKey(key);
    setError('');
    setMessage('');
    try {
      await apiPut(`/admin/settings/${key}`, { value: values[key] }, true);
      setMessage(`${labels[key].title}을 저장했습니다.`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <AppShell
      variant="admin"
      title="안내문 관리"
      description="손님에게 노출되는 운영 안내와 예약 전 확인 문구를 관리합니다."
      actions={
        <button type="button" className="btn btn-secondary" onClick={fetchSettings}>
          <RefreshCw size={17} aria-hidden="true" />
          새로고침
        </button>
      }
    >
      <div className="stack-lg">
        {error && <div className="message message-error">{error}</div>}
        {message && <div className="message message-success">{message}</div>}

        {loading ? (
          <LoadingSpinner size="lg" message="문구를 불러오는 중..." />
        ) : (
          (Object.keys(labels) as SettingKey[]).map((key) => (
            <section key={key} className="dashboard-grid">
              <div className="surface span-6">
                <div className="surface-header">
                  <div>
                    <p className="eyebrow">편집</p>
                    <h2>{labels[key].title}</h2>
                    <p className="muted">{labels[key].description}</p>
                  </div>
                  <FileText size={22} aria-hidden="true" />
                </div>
                <div className="surface-body stack">
                  <textarea
                    value={values[key]}
                    onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
                    aria-label={labels[key].title}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => saveSetting(key)}
                    disabled={savingKey === key}
                  >
                    <Save size={17} aria-hidden="true" />
                    {savingKey === key ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
              <div className="surface span-6">
                <div className="surface-header">
                  <div>
                    <p className="eyebrow">미리보기</p>
                    <h2>{labels[key].title}</h2>
                  </div>
                </div>
                <div className="surface-body">
                  {values[key] ? (
                    <MarkdownViewer content={values[key]} />
                  ) : (
                    <div className="empty-state">
                      <strong>아직 입력된 내용이 없습니다.</strong>
                      <span>왼쪽에 문구를 입력하면 미리보기가 표시됩니다.</span>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}
