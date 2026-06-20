'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, RefreshCw, Save, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPost, apiPut, getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useRequireAdmin } from '@/lib/useAuthGuard';
import type { BannedUser, SettingValue } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function AdminBannedUsersPage() {
  useRequireAdmin();
  const [users, setUsers] = useState<BannedUser[]>([]);
  const [threshold, setThreshold] = useState('3');
  const [form, setForm] = useState({ user_uuid: '', nickname: '', reason: '', active: true });
  const [deleteTarget, setDeleteTarget] = useState<BannedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [userData, thresholdData] = await Promise.all([
        apiGet<BannedUser[]>('/admin/banned-users', true),
        apiGet<SettingValue>('/admin/settings/noshow_ban_threshold', true),
      ]);
      setUsers(userData);
      setThreshold(thresholdData.value || '3');
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const saveThreshold = async () => {
    setSaving(true);
    setError('');
    try {
      await apiPut('/admin/settings/noshow_ban_threshold', { value: threshold }, true);
      setMessage('노쇼 자동 제한 기준을 저장했습니다.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiPost('/admin/banned-users', form, true);
      setMessage('예약 제한 정보를 저장했습니다.');
      setForm({ user_uuid: '', nickname: '', reason: '', active: true });
      fetchData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError('');
    try {
      await apiDelete(`/admin/banned-users/${deleteTarget.user_uuid}`, true);
      setMessage('예약 제한을 해제했습니다.');
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      variant="admin"
      title="노쇼/예약 제한"
      description="노쇼 누적 고객과 수동 예약 제한을 관리합니다."
      actions={
        <button type="button" className="btn btn-secondary" onClick={fetchData}>
          <RefreshCw size={17} aria-hidden="true" />
          새로고침
        </button>
      }
    >
      <div className="dashboard-grid">
        <section className="surface span-4">
          <div className="surface-header">
            <div>
              <p className="eyebrow">기준</p>
              <h2>자동 제한 기준</h2>
            </div>
            <Ban size={22} aria-hidden="true" />
          </div>
          <div className="surface-body stack">
            <p className="muted">노쇼 횟수는 예약 건수가 아니라 판매 일자당 1회로 계산됩니다.</p>
            <div className="form-group">
              <label className="form-label" htmlFor="threshold">자동 제한 기준</label>
              <input id="threshold" type="number" min={1} value={threshold} onChange={(event) => setThreshold(event.target.value)} />
            </div>
            <button type="button" className="btn btn-primary" onClick={saveThreshold} disabled={saving}>
              <Save size={17} aria-hidden="true" />
              기준 저장
            </button>
          </div>
        </section>

        <section className="surface span-8">
          <div className="surface-header">
            <div>
              <p className="eyebrow">수동 등록</p>
              <h2>예약 제한 추가/수정</h2>
            </div>
          </div>
          <form className="surface-body stack" onSubmit={saveUser}>
            {error && <div className="message message-error">{error}</div>}
            {message && <div className="message message-success">{message}</div>}
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="ban-user-uuid">고객 식별값</label>
                <input id="ban-user-uuid" value={form.user_uuid} onChange={(event) => setForm({ ...form, user_uuid: event.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="ban-nickname">닉네임</label>
                <input id="ban-nickname" value={form.nickname} onChange={(event) => setForm({ ...form, nickname: event.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ban-reason">사유</label>
              <input id="ban-reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="운영자 수동 등록" />
            </div>
            <label className="check-line">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              예약 제한 활성화
            </label>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              저장
            </button>
          </form>
        </section>

        <section className="surface span-12">
          <div className="surface-header">
            <div>
              <p className="eyebrow">목록</p>
              <h2>예약 제한 고객</h2>
            </div>
          </div>
          <div className="surface-body">
            {loading ? (
              <LoadingSpinner message="예약 제한 목록을 불러오는 중..." />
            ) : users.length === 0 ? (
              <div className="empty-state">
                <strong>예약 제한 고객이 없습니다.</strong>
                <span>영업 마감 후 자동 제한 또는 수동 등록 시 표시됩니다.</span>
              </div>
            ) : (
              users.map((user) => (
                <div key={user.user_uuid} className="list-row">
                  <div className="row-main">
                    <p className="row-title">{user.nickname || user.user_uuid}</p>
                    <div className="row-meta">
                      <span>{user.active === false ? '비활성' : '활성'}</span>
                      {typeof user.no_show_count === 'number' ? <span>노쇼 {user.no_show_count}회</span> : null}
                      {user.reason ? <span>{user.reason}</span> : null}
                      {user.created_at ? <span>등록 일시: {formatDateTime(user.created_at)}</span> : null}
                    </div>
                  </div>
                  <button type="button" className="btn btn-danger" onClick={() => setDeleteTarget(user)}>
                    <Trash2 size={17} aria-hidden="true" />
                    해제
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="예약 제한을 해제할까요?"
        message="해제 후 해당 고객은 다시 예약할 수 있습니다."
        confirmText="해제"
        variant="warning"
        loading={saving}
        onConfirm={deleteUser}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
