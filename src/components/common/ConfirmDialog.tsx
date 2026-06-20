'use client';

import { useEffect } from 'react';
import { AlertTriangle, Info, Zap } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '확인',
  cancelText = '취소',
  variant = 'default',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const confirmBtnClass = variant === 'danger' ? 'btn btn-danger' : variant === 'warning' ? 'btn btn-warning' : 'btn btn-primary';
  const icon = variant === 'danger'
    ? <AlertTriangle size={30} aria-hidden="true" />
    : variant === 'warning'
      ? <Zap size={30} aria-hidden="true" />
      : <Info size={30} aria-hidden="true" />;

  return (
    <>
      <div className="overlay" onClick={onCancel} />
      <div className="confirm-dialog">
        <div className={`confirm-icon confirm-icon-${variant}`}>{icon}</div>
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            {cancelText}
          </button>
          <button className={confirmBtnClass} onClick={onConfirm} disabled={loading}>
            {loading ? '처리 중...' : confirmText}
          </button>
        </div>
      </div>
      <style jsx>{`
        .confirm-dialog {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-8);
          z-index: var(--z-modal);
          width: calc(100% - 2rem);
          max-width: 420px;
          text-align: center;
          animation: scaleIn var(--transition-base) both;
          box-shadow: var(--shadow-xl);
        }
        .confirm-icon {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: var(--space-4);
        }
        .confirm-icon-danger { color: var(--color-error); background: var(--color-error-subtle); }
        .confirm-icon-warning { color: var(--color-warning); background: var(--color-warning-subtle); }
        .confirm-icon-default { color: var(--color-info); background: var(--color-info-subtle); }
        .confirm-title {
          font-size: var(--text-lg);
          font-weight: var(--font-bold);
          margin-bottom: var(--space-3);
          color: var(--color-text-primary);
        }
        .confirm-message {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          line-height: var(--leading-relaxed);
          margin-bottom: var(--space-6);
          white-space: pre-line;
        }
        .confirm-actions {
          display: flex;
          gap: var(--space-3);
          justify-content: center;
        }
        .confirm-actions .btn {
          flex: 1;
          max-width: 160px;
        }
      `}</style>
    </>
  );
}
