import { NextResponse } from 'next/server';
import { clearAuthCookies, getRefreshCookie, revokeRefreshToken } from '@/lib/auth';

export async function POST() {
  const refreshCookie = getRefreshCookie();
  if (refreshCookie) await revokeRefreshToken(refreshCookie);
  const res = NextResponse.json({ ok: true });
  return clearAuthCookies(res);
}
