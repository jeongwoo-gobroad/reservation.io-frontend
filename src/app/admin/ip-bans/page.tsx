'use client';

import { useCallback, useEffect, useState } from 'react';
import { Network, RefreshCw, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPost, getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useRequireAdmin } from '@/lib/useAuthGuard';
import type { IpBan } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function AdminIpBansPage() {
  useRequireAdmin();
  const [items, setItems] = useState<IpBan[]>([]);
  const [form, setForm] = useState({ ip_address: '', reason: '', active: true });
  const [deleteTarget, setDeleteTarget] = useState<IpBan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<IpBan[]>('/admin/ip-bans', true);
      setItems(data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchItems);
  }, [fetchItems]);

  const saveIp = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiPost('/admin/ip-bans', form, true);
      setMessage('IP 제한 정보를 저장했습니다.');
      setForm({ ip_address: '', reason: '', active: true });
      fetchItems();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteIp = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError('');
    try {
      await apiDelete(`/admin/ip-bans/${encodeURIComponent(deleteTarget.ip_address)}`, true);
      setMessage('IP 제한을 해제했습니다.');
      setDeleteTarget(null);
      fetchItems();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      variant="admin"
      title="IP 관리"
      description="관리자 기능 접근이 제한된 IP를 확인하고 관리합니다."
      actions={
        <button type="button" className="btn btn-secondary" onClick={fetchItems}>
          <RefreshCw size={17} aria-hidden="true" />
          새로고침
        </button>
      }
    >
      <div className="dashboard-grid">
        <section className="surface span-4">
          <div className="surface-header">
            <div>
              <p className="eyebrow">추가</p>
              <h2>IP 제한 등록</h2>
            </div>
            <Network size={22} aria-hidden="true" />
          </div>
          <form className="surface-body stack" onSubmit={saveIp}>
            {error && <div className="message message-error">{error}</div>}
            {message && <div className="message message-success">{message}</div>}
            <div className="form-group">
              <label className="form-label" htmlFor="ip-address">IP</label>
              <input
                id="ip-address"
                value={form.ip_address}
                onChange={(event) => setForm({ ...form, ip_address: event.target.value })}
                placeholder="203.0.113.10"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ip-reason">사유</label>
              <input id="ip-reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
            </div>
            <label className="check-line">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              활성 상태
            </label>
            <button type="submit" className="btn btn-primary" disabled={saving}>저장</button>
          </form>
        </section>

        <section className="surface span-8">
          <div className="surface-header">
            <div>
              <p className="eyebrow">목록</p>
              <h2>IP 제한 목록</h2>
            </div>
          </div>
          <div className="surface-body">
            {loading ? (
              <LoadingSpinner message="IP 목록을 불러오는 중..." />
            ) : items.length === 0 ? (
              <div className="empty-state">
                <strong>제한된 IP가 없습니다.</strong>
                <span>관리자 로그인 실패 누적 또는 수동 등록 시 표시됩니다.</span>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.ip_address} className="list-row">
                  <div className="row-main">
                    <p className="row-title">{item.ip_address}</p>
                    <div className="row-meta">
                      <span>{item.active === false ? '비활성' : '활성'}</span>
                      {item.reason ? <span>{item.reason}</span> : null}
                      {item.created_at ? <span>등록 일시: {formatDateTime(item.created_at)}</span> : null}
                    </div>
                  </div>
                  <button type="button" className="btn btn-danger" onClick={() => setDeleteTarget(item)}>
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
        title="IP 제한을 해제할까요?"
        message="해제 후 해당 IP에서 관리자 기능 접근이 다시 가능해질 수 있습니다."
        confirmText="해제"
        variant="warning"
        loading={saving}
        onConfirm={deleteIp}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
