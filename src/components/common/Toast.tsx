'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const icons: Record<ToastType, ReactNode> = {
    success: <CheckCircle2 size={16} aria-hidden="true" />,
    error: <AlertCircle size={16} aria-hidden="true" />,
    warning: <AlertTriangle size={16} aria-hidden="true" />,
    info: <Info size={16} aria-hidden="true" />,
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            onClick={() => removeToast(toast.id)}
          >
            <span className="toast-icon">{icons[toast.type]}</span>
            <span className="toast-message">{toast.message}</span>
          </div>
        ))}
      </div>
      <style jsx>{`
        .toast {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-4) var(--space-5);
          border-radius: var(--radius-lg);
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          cursor: pointer;
          animation: slideInFromRight var(--transition-base) both;
          box-shadow: var(--shadow-lg);
          font-size: var(--text-sm);
        }
        .toast-success {
          background: rgba(52, 211, 153, 0.15);
          border-color: rgba(52, 211, 153, 0.3);
          color: var(--color-success);
        }
        .toast-error {
          background: rgba(248, 113, 113, 0.15);
          border-color: rgba(248, 113, 113, 0.3);
          color: var(--color-error);
        }
        .toast-warning {
          background: rgba(251, 191, 36, 0.15);
          border-color: rgba(251, 191, 36, 0.3);
          color: var(--color-warning);
        }
        .toast-info {
          background: rgba(96, 165, 250, 0.15);
          border-color: rgba(96, 165, 250, 0.3);
          color: var(--color-info);
        }
        .toast-icon {
          width: 24px;
          height: 24px;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: var(--font-bold);
          font-size: var(--text-xs);
          flex-shrink: 0;
        }
        .toast-success .toast-icon { background: rgba(52, 211, 153, 0.2); }
        .toast-error .toast-icon { background: rgba(248, 113, 113, 0.2); }
        .toast-warning .toast-icon { background: rgba(251, 191, 36, 0.2); }
        .toast-info .toast-icon { background: rgba(96, 165, 250, 0.2); }
        .toast-message {
          flex: 1;
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
