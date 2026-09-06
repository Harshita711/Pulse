import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from './db';
import { getRequiredEnv } from './env';

// --- Refresh-token rotation with reuse-detection revocation ---
// Every successful /api/auth/refresh call revokes the presented refresh
// token and issues a new one in the same rotation "family" (RefreshToken
// model, prisma/schema.prisma). If a token that's already been rotated is
// ever presented again, that's a reuse signal -- most likely a leaked
// token being replayed -- and the entire family is revoked immediately,
// forcing a fresh login. Access tokens are short-lived (15 min) and are
// not tracked server-side; only refresh tokens carry a jti and a DB row,
// since that's where the actual revocation surface needs to live.

const ACCESS_TTL = '15m';
const REFRESH_TTL = '30d';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
}

interface RefreshTokenPayload extends AccessTokenPayload {
  jti: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getRequiredEnv('JWT_ACCESS_SECRET'), { expiresIn: ACCESS_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.verify(token, getRequiredEnv('JWT_ACCESS_SECRET')) as AccessTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Issues a fresh access + refresh token pair, creating a new server-side
 * RefreshToken row. Pass `familyId` when rotating an existing session
 * (continues its chain); omit it for a brand-new login (starts a new
 * chain, family = the new token's own id).
 */
export async function issueTokenPair(
  userId: string,
  email: string,
  familyId?: string
): Promise<{ accessToken: string; refreshToken: string; refreshTokenId: string }> {
  const id = randomUUID();
  const finalFamilyId = familyId ?? id;
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  await prisma.refreshToken.create({
    data: { id, userId, familyId: finalFamilyId, expiresAt },
  });

  const accessToken = signAccessToken({ sub: userId, email });
  const refreshToken = jwt.sign(
    { sub: userId, email, jti: id } satisfies RefreshTokenPayload,
    getRequiredEnv('JWT_REFRESH_SECRET'),
    { expiresIn: REFRESH_TTL }
  );

  return { accessToken, refreshToken, refreshTokenId: id };
}

/**
 * Verifies the refresh token, checks it against the server-side
 * RefreshToken row, and either:
 *  - rotates it (revokes the old row, issues + returns a new pair), or
 *  - detects reuse (the presented token was already revoked once before)
 *    and revokes the *entire* family, returning null, or
 *  - returns null for any other invalid/expired/unknown token.
 * Callers must treat a null return as "session is dead, clear cookies and
 * require login" -- never silently retry with the same token.
 */
export async function rotateRefreshToken(
  token: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(token, getRequiredEnv('JWT_REFRESH_SECRET')) as RefreshTokenPayload;
  } catch {
    return null;
  }
  if (!payload.jti) return null;

  const record = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
  if (!record || record.userId !== payload.sub) return null;
  if (record.expiresAt < new Date()) return null;

  // Fix 3: atomic revocation. Instead of the previous read-then-write
  // (checking record.revokedAt, then later writing the revocation), we use
  // a single updateMany with { revokedAt: null } in the WHERE clause.
  // If another concurrent refresh call already revoked this token between
  // our findUnique and this updateMany, count will be 0 — we treat that as
  // reuse and revoke the entire family.

  // Issue the replacement pair first so we have replacedById for the link.
  const { accessToken, refreshToken, refreshTokenId } = await issueTokenPair(
    payload.sub,
    payload.email,
    record.familyId
  );

  // Atomically revoke the old token — only succeeds if it's still un-revoked.
  const revoked = await prisma.refreshToken.updateMany({
    where: { id: record.id, revokedAt: null },
    data: { revokedAt: new Date(), replacedById: refreshTokenId },
  });

  if (revoked.count === 0) {
    // Race lost (or genuine reuse): someone else already revoked this token.
    // Revoke the entire family AND the orphaned new token we just created.
    await prisma.refreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  return { accessToken, refreshToken };
}

/** Revokes a single refresh token (used on logout). Never throws on an already-invalid token. */
export async function revokeRefreshToken(token: string): Promise<void> {
  try {
    const payload = jwt.verify(token, getRequiredEnv('JWT_REFRESH_SECRET')) as RefreshTokenPayload;
    if (!payload.jti) return;
    await prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // Invalid/expired token being logged out anyway -- nothing to revoke, not an error.
  }
}

const baseCookieOpts = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};

export function applyAuthCookies(res: NextResponse, accessToken: string, refreshToken: string) {
  res.cookies.set('pulse_access', accessToken, { ...baseCookieOpts, path: '/', maxAge: 15 * 60 });
  // Scoped to /api/auth only: the refresh token is never sent on ordinary
  // page/API requests, only to the auth endpoints that actually need it
  // (refresh, logout) -- narrowing where a stolen cookie would even work.
  res.cookies.set('pulse_refresh', refreshToken, {
    ...baseCookieOpts,
    path: '/api/auth',
    maxAge: REFRESH_TTL_MS / 1000,
  });
  return res;
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set('pulse_access', '', { ...baseCookieOpts, path: '/', maxAge: 0 });
  res.cookies.set('pulse_refresh', '', { ...baseCookieOpts, path: '/api/auth', maxAge: 0 });
  return res;
}

/** Reads the current user from the access-token cookie. Server components / route handlers only. */
export async function getCurrentUser(): Promise<AccessTokenPayload | null> {
  const token = cookies().get('pulse_access')?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

/** Reads the raw refresh-token cookie value. Only readable by routes under /api/auth (cookie path). */
export function getRefreshCookie(): string | null {
  return cookies().get('pulse_refresh')?.value ?? null;
}
