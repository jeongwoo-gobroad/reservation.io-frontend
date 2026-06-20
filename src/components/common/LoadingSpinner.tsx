'use client';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

export default function LoadingSpinner({ size = 'md', message }: LoadingSpinnerProps) {
  const sizeMap = { sm: '20px', md: '36px', lg: '48px' };
  const borderMap = { sm: '2px', md: '3px', lg: '4px' };
  
  return (
    <div className="spinner-container">
      <div className="spinner" />
      {message && <p className="spinner-message">{message}</p>}
      <style jsx>{`
        .spinner-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-4);
          padding: var(--space-8);
        }
        .spinner {
          width: ${sizeMap[size]};
          height: ${sizeMap[size]};
          border: ${borderMap[size]} solid var(--color-border);
          border-top-color: var(--color-accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .spinner-message {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
        }
      `}</style>
    </div>
  );
}
