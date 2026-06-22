'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Save, Trash2, UserRound } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, getErrorMessage } from '@/lib/api';
import { removeUserToken, setUserInfo } from '@/lib/auth';
import { useRequireUser } from '@/lib/useAuthGuard';
import type { UserProfile } from '@/lib/types';
import AppShell from '@/components/Layout/AppShell';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import LoadingSpinner from '@/components/common/LoadingSpinner';

type WithdrawStep = 'first' | 'second' | null;

export default function ProfilePage() {
  useRequireUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawStep, setWithdrawStep] = useState<WithdrawStep>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<UserProfile>('/users/me');
      setProfile(data);
      setNickname(data.nickname || '');
      setUserInfo({
        user_uuid: data.user_uuid,
        kakao_id: data.kakao_id,
        nickname: data.nickname || '',
      });
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchProfile);
  }, [fetchProfile]);

  const saveNickname = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError('닉네임을 입력해 주세요.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');
    try {
      const updated = await apiPatch<UserProfile>('/users/me/nickname', { nickname: trimmed });
      const nextProfile = {
        ...(profile || updated),
        ...updated,
        nickname: updated?.nickname || trimmed,
      } as UserProfile;
      setProfile(nextProfile);
      setNickname(nextProfile.nickname || trimmed);
      setUserInfo({
        user_uuid: nextProfile.user_uuid,
        kakao_id: nextProfile.kakao_id,
        nickname: nextProfile.nickname || trimmed,
      });
      setMessage('닉네임을 저장했습니다.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    setWithdrawing(true);
    setError('');
    try {
      await apiDelete<void>('/users/me');
      removeUserToken();
      window.location.href = '/';
    } catch (err) {
      setError(getErrorMessage(err));
      setWithdrawStep(null);
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="개인정보 수정" description="계정 정보를 불러오고 있습니다.">
        <LoadingSpinner size="lg" message="개인정보를 불러오는 중..." />
      </AppShell>
    );
  }

  return (
    <AppShell title="개인정보 수정" description="닉네임을 변경하거나 계정을 탈퇴할 수 있습니다.">
      <div className="dashboard-grid">
        <section className="surface span-7">
          <div className="surface-header">
            <div>
              <p className="eyebrow">프로필</p>
              <h2>닉네임 변경</h2>
            </div>
            <UserRound size={22} aria-hidden="true" />
          </div>
          <form className="surface-body stack" onSubmit={saveNickname}>
            {error ? (
              <div className="message message-error">
                <AlertCircle size={18} aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}
            {message ? <div className="message message-success">{message}</div> : null}
            <div className="form-group">
              <label className="form-label" htmlFor="profile-nickname">
                닉네임
              </label>
              <input
                id="profile-nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="닉네임을 입력해 주세요"
                maxLength={40}
                required
              />
              <p className="field-help">상단바와 예약 확인 화면에 표시되는 이름입니다.</p>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={17} aria-hidden="true" />
              {saving ? '저장 중...' : '닉네임 저장'}
            </button>
          </form>
        </section>

        <section className="surface span-5">
          <div className="surface-header">
            <div>
              <p className="eyebrow">계정</p>
              <h2>회원 탈퇴</h2>
            </div>
            <Trash2 size={22} aria-hidden="true" />
          </div>
          <div className="surface-body stack">
            <div className="message message-warning">
              탈퇴하면 계정, 예약, 방문 확인, 노쇼, 예약 제한 기록이 삭제되며 복구할 수 없습니다.
            </div>
            <button type="button" className="btn btn-danger" onClick={() => setWithdrawStep('first')}>
              <Trash2 size={17} aria-hidden="true" />
              회원 탈퇴
            </button>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={withdrawStep === 'first'}
        title="탈퇴하시겠습니까?"
        message="탈퇴하면 계정 정보와 연결된 예약, 방문 확인, 노쇼, 예약 제한 기록이 삭제되며 복구할 수 없습니다."
        confirmText="탈퇴 진행"
        variant="warning"
        loading={withdrawing}
        onConfirm={() => setWithdrawStep('second')}
        onCancel={() => setWithdrawStep(null)}
      />

      <ConfirmDialog
        open={withdrawStep === 'second'}
        title="정말 탈퇴하시겠습니까?"
        message="이 작업은 되돌릴 수 없습니다. 탈퇴 후 기존 토큰은 사용할 수 없으며 다시 로그인해야 합니다."
        confirmText="영구 탈퇴"
        variant="danger"
        loading={withdrawing}
        onConfirm={withdraw}
        onCancel={() => setWithdrawStep(null)}
      />
    </AppShell>
  );
}
