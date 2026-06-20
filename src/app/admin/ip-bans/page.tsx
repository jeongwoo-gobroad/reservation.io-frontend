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
  const [form, setForm] = useState({ ip_address: '', actor_key: '', user_uuid: '', nickname: '', reason: '', active: true });
  const [query, setQuery] = useState('');
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
      await apiPost('/admin/ip-bans', {
        ...form,
        actor_key: form.actor_key || undefined,
        user_uuid: form.user_uuid || undefined,
        nickname: form.nickname || undefined,
      }, true);
      setMessage('IP 제한 정보를 저장했습니다.');
      setForm({ ip_address: '', actor_key: '', user_uuid: '', nickname: '', reason: '', active: true });
      await fetchItems();
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
      const actorQuery = deleteTarget.actor_key ? `?actor_key=${encodeURIComponent(deleteTarget.actor_key)}` : '';
      await apiDelete(`/admin/ip-bans/${encodeURIComponent(deleteTarget.ip_address)}${actorQuery}`, true);
      setMessage('IP 제한을 해제했습니다.');
      setDeleteTarget(null);
      await fetchItems();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [item.ip_address, item.nickname, item.user_uuid, item.actor_key, item.reason]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });

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
            <div className="form-group">
              <label className="form-label" htmlFor="ip-nickname">닉네임</label>
              <input id="ip-nickname" value={form.nickname} onChange={(event) => setForm({ ...form, nickname: event.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ip-user-uuid">사용자 번호</label>
              <input id="ip-user-uuid" value={form.user_uuid} onChange={(event) => setForm({ ...form, user_uuid: event.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ip-actor-key">차단 범위</label>
              <input
                id="ip-actor-key"
                value={form.actor_key}
                onChange={(event) => setForm({ ...form, actor_key: event.target.value })}
                placeholder="예: user:..."
              />
              <p className="field-help">비워두면 IP 전체 차단으로 저장됩니다.</p>
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
          <div className="surface-body stack">
            <div className="toolbar">
              <div className="form-group">
                <label className="form-label" htmlFor="ip-search">검색</label>
                <input
                  id="ip-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="IP, 닉네임, 사용자 번호, 사유"
                />
              </div>
            </div>
            {loading ? (
              <LoadingSpinner message="IP 목록을 불러오는 중..." />
            ) : filteredItems.length === 0 ? (
              <div className="empty-state">
                <strong>{items.length === 0 ? '제한된 IP가 없습니다.' : '검색 결과가 없습니다.'}</strong>
                <span>관리자 로그인 실패, 자동 반복 요청 차단, 수동 등록 시 표시됩니다.</span>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>IP</th>
                      <th>닉네임</th>
                      <th>사용자 번호</th>
                      <th>차단 범위</th>
                      <th>사유</th>
                      <th>상태</th>
                      <th>등록 일시</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={`${item.ip_address}-${item.actor_key || 'all'}`}>
                        <td>{item.ip_address}</td>
                        <td>{item.nickname || '-'}</td>
                        <td>{item.user_uuid || '-'}</td>
                        <td>{item.actor_key || 'IP 전체'}</td>
                        <td>{item.reason || '-'}</td>
                        <td>{item.active === false ? '비활성' : '활성'}</td>
                        <td>{formatDateTime(item.created_at)}</td>
                        <td>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(item)}>
                            <Trash2 size={15} aria-hidden="true" />
                            해제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
