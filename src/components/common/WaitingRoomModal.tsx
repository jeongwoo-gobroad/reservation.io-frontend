'use client';

import LoadingSpinner from './LoadingSpinner';
import type { WaitingRoomResponse } from '@/lib/types';

interface WaitingRoomModalProps {
  actionLabel: string;
  response: WaitingRoomResponse | null;
}

export default function WaitingRoomModal({ actionLabel, response }: WaitingRoomModalProps) {
  if (!response) return null;

  return (
    <>
      <div className="overlay" />
      <div className="modal animate-scale-in" role="dialog" aria-modal="true" aria-labelledby="waiting-room-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">접속 대기</p>
            <h3 id="waiting-room-title">{actionLabel} 요청이 많습니다</h3>
          </div>
        </div>
        <div className="modal-body stack">
          <div className="waiting-room-panel">
            {response.position ? (
              <div className="waiting-room-position">
                <span>현재 대기 순번</span>
                <strong>{response.position.toLocaleString('ko-KR')}번</strong>
              </div>
            ) : null}
            <LoadingSpinner size="md" message="순서가 오면 자동으로 다시 시도합니다." />
          </div>
          <div className="message message-info">
            {response.message || '예약 요청이 몰려 잠시 대기 중입니다.'}
            {response.retry_after_seconds ? ` 약 ${response.retry_after_seconds}초 뒤 다시 확인합니다.` : ''}
          </div>
        </div>
      </div>
    </>
  );
}
