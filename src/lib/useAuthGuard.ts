'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAdminLoggedIn, isUserLoggedIn } from '@/lib/auth';

export function useRequireUser() {
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoggedIn()) router.replace('/');
  }, [router]);
}

export function useRequireAdmin() {
  const router = useRouter();

  useEffect(() => {
    if (!isAdminLoggedIn()) router.replace('/admin/login');
  }, [router]);
}
