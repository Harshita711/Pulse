import { NextResponse } from 'next/server';
import { applyAuthCookies, clearAuthCookies, getRefreshCookie, rotateRefreshToken } from '@/lib/auth';
import { jsonError } from '@/lib/apiHelpers';

// Rotation-on-use: every call here revokes the presented refresh token and
// issues a new one. Presenting an already-rotated token is treated as
// reuse and revokes the entire session family -- see rotateRefreshToken
// in src/lib/auth.ts for the detection logic.
export async function POST() {
  const refreshCookie = getRefreshCookie();
  if (!refreshCookie) {
    return jsonError(401, 'No refresh token');
  }

  const result = await rotateRefreshToken(refreshCookie);
  if (!result) {
    // Invalid, expired, unknown, or reused -- the session is dead either
    // way. Clear whatever cookies remain rather than leaving a stale one
    // around for a client to keep retrying with.
    const res = jsonError(401, 'Refresh token invalid, expired, or already used -- please log in again');
    return clearAuthCookies(res);
  }

  const res = NextResponse.json({ ok: true });
  return applyAuthCookies(res, result.accessToken, result.refreshToken);
}
