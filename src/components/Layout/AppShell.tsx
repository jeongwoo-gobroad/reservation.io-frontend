'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  ClipboardCheck,
  Home,
  LogOut,
  QrCode,
  Shield,
  UserRound,
} from 'lucide-react';
import Footer from '@/components/Layout/Footer';
import { logoutAdmin, logoutUser } from '@/lib/auth';
import { SERVICE_NAME } from '@/lib/constants';

interface ShellAction {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  eyebrow?: string;
  description?: string;
  actions?: React.ReactNode;
  variant?: 'user' | 'admin';
}

const userNav: ShellAction[] = [
  { href: '/schedules', label: '예약', icon: <CalendarDays size={18} /> },
  { href: '/reservations', label: '내 예약', icon: <ClipboardCheck size={18} /> },
  { href: '/visit', label: '방문 확인증', icon: <QrCode size={18} /> },
];

const adminNav: ShellAction[] = [
  { href: '/admin', label: '메인', icon: <Home size={18} /> },
  { href: '/admin/visits', label: '방문 확인', icon: <QrCode size={18} /> },
  { href: '/admin/schedules', label: '일정 관리', icon: <CalendarDays size={18} /> },
  { href: '/admin/reservations', label: '예약 현황', icon: <ClipboardCheck size={18} /> },
  { href: '/admin/banned-users', label: '예약 제한', icon: <UserRound size={18} /> },
  { href: '/admin/ip-bans', label: 'IP 관리', icon: <Shield size={18} /> },
  { href: '/admin/settings', label: '문구 관리', icon: <ClipboardCheck size={18} /> },
];

export default function AppShell({
  children,
  title,
  eyebrow,
  description,
  actions,
  variant = 'user',
}: AppShellProps) {
  const pathname = usePathname();
  const nav = variant === 'admin' ? adminNav : userNav;
  const logout = variant === 'admin' ? logoutAdmin : logoutUser;

  return (
    <div className={`app-shell app-shell-${variant}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <Link href={variant === 'admin' ? '/admin' : '/schedules'} className="brand-mark" aria-label="홈">
            <span className="brand-symbol">R</span>
            <span className="brand-name">{SERVICE_NAME}</span>
          </Link>
          {variant === 'admin' && <span className="brand-tag">운영 콘솔</span>}
        </div>
        <button type="button" className="icon-text-button" onClick={logout}>
          <LogOut size={18} aria-hidden="true" />
          <span>로그아웃</span>
        </button>
      </header>

      <nav className="rail-nav" aria-label={variant === 'admin' ? '관리자 메뉴' : '이용자 메뉴'}>
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={`rail-link ${active ? 'active' : ''}`}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <main className="shell-main">
        {(title || description || actions) && (
          <div className="page-heading">
            <div>
              {eyebrow && <p className="eyebrow">{eyebrow}</p>}
              {title && <h1>{title}</h1>}
              {description && <p>{description}</p>}
            </div>
            {actions && <div className="heading-actions">{actions}</div>}
          </div>
        )}
        {children}
      </main>
      <Footer wide={variant === 'admin'} />
    </div>
  );
}
