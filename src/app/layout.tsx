import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: {
    default: 'Reservatio - 예약 시스템',
    template: '%s | Reservatio',
  },
  description: '카카오 로그인, 방문 확인, 관리자 운영을 위한 예약 프론트엔드',
  applicationName: 'Reservatio',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#f7f5ef',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
