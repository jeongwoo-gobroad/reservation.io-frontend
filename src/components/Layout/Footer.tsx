'use client';

import Link from 'next/link';
import { COMPANY_URL, DISPLAY_TIMEZONE_LABEL } from '@/lib/constants';

export default function Footer({ wide = false }: { wide?: boolean }) {
  return (
    <footer className="footer">
      <div className={`footer-inner ${wide ? 'footer-wide' : ''}`}>
        <p className="footer-timezone">
          시간 표시 기준: {DISPLAY_TIMEZONE_LABEL}
        </p>
        <p className="footer-copyright">
          Powered by DataMax, © 2026{' '}
          <a href={COMPANY_URL} target="_blank" rel="noopener noreferrer">
            실용주의 컴퓨팅 연구소
          </a>
        </p>
        <p className="footer-links">
          <Link href="/privacy">개인정보 처리방침</Link>
        </p>
      </div>
      <style jsx>{`
        .footer {
          padding: var(--space-6) var(--space-4);
          text-align: center;
          border-top: 1px solid var(--color-border);
          margin-top: auto;
          background: var(--color-bg-elevated);
        }
        .footer-inner {
          max-width: var(--max-width-md);
          margin: 0 auto;
        }
        .footer-wide {
          max-width: var(--max-width-2xl);
        }
        .footer-timezone {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          margin-bottom: var(--space-1);
        }
        .footer-copyright {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }
        .footer-copyright a {
          color: var(--color-accent);
          transition: color var(--transition-fast);
        }
        .footer-copyright a:hover {
          color: var(--color-accent-hover);
        }
        .footer-links {
          margin-top: var(--space-1);
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }
        .footer-links a {
          color: var(--color-accent);
        }
        .footer-links a:hover {
          color: var(--color-accent-hover);
        }
      `}</style>
    </footer>
  );
}
