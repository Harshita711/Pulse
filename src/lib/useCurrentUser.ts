'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from './apiClient';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  sensitivity: 'QUIET' | 'BALANCED' | 'HIGH';
  onboarded: boolean;
  monthlyIncome: number | null;
  monthlyBudget: number | null;
}

/** Fetches /api/auth/me; redirects to /login on 401. Renders nothing until resolved. */
export function useCurrentUser(options: { requireOnboarded?: boolean } = {}) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    api
      .get<CurrentUser>('/auth/me')
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        if (options.requireOnboarded && !u.onboarded) router.replace('/onboarding');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.status === 401) router.replace('/login');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, loading };
}
