import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { getCurrentUser } from './auth';

// Step 3c: one consistent error envelope across the entire API, instead of
// each route inventing its own shape. Success responses are unchanged
// (still the raw resource, e.g. `{ id, name, ... }`) -- only the error path
// was ad-hoc before, and only the error path is standardized here. Wrapping
// success responses too would be a much larger, unrequested breaking
// change across every client call site (apiClient.ts destructures the raw
// shape directly), so this deliberately doesn't touch that.

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string };
  requestId: string;
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
  }
}

export class ApiError extends Error {
  public code: string;
  constructor(public status: number, message: string, code?: string) {
    super(message);
    this.code = code ?? defaultCodeForStatus(status);
  }
}

function errorEnvelope(code: string, message: string): ApiErrorBody {
  // Short, not cryptographically meaningful -- purely for correlating a
  // client-visible error with a server log line (the full err is still
  // console.error'd below on 500s).
  return { success: false, error: { code, message }, requestId: randomUUID().slice(0, 8) };
}

/**
 * For the handful of routes that return an error before there's a
 * try/catch worth wrapping around them (a simple early-return auth check,
 * for instance) -- same envelope as handleError, without needing an
 * ApiError thrown through a catch block.
 */
export function jsonError(status: number, message: string, code?: string): NextResponse {
  return NextResponse.json(errorEnvelope(code ?? defaultCodeForStatus(status), message), { status });
}

// Friendly messages for the unique constraints that actually exist in
// schema.prisma, keyed by their sorted field list. Falls back to a
// reasonable generic message for any constraint not listed here (e.g. one
// added later and not wired into this map yet) rather than erroring.
const FRIENDLY_CONFLICT_MESSAGES: Record<string, string> = {
  'instrumentId,watchlistId': 'This instrument is already in this watchlist.',
  'instrumentId,userId': 'You already have a relationship recorded for this instrument.',
  'deviceId,userId,watchlistId': 'A checkpoint for this device already exists.',
  'instrumentId,source,timestamp': 'A snapshot for this exact moment already exists.',
  email: 'An account with this email already exists.',
  symbol: 'An instrument with this symbol already exists.',
};

function messageForUniqueConstraint(target: unknown): string {
  const fields = Array.isArray(target) ? [...target].sort().join(',') : typeof target === 'string' ? target : '';
  return FRIENDLY_CONFLICT_MESSAGES[fields] ?? 'This record already exists.';
}

/** Every route.ts handler wraps its body in this: consistent auth + error shape. */
export async function withAuth<T>(handler: (userId: string) => Promise<T>): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json(errorEnvelope('UNAUTHENTICATED', 'Not authenticated'), { status: 401 });
    const result = await handler(user.sub);
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}

/** For POST/PATCH/DELETE handlers that need to parse a body before responding. */
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, 'Not authenticated');
  return user.sub;
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(errorEnvelope(err.code, err.message), { status: err.status });
  }
  if (err instanceof ZodError) {
    const message = err.issues[0]?.message ?? 'Invalid request';
    return NextResponse.json(errorEnvelope('VALIDATION_ERROR', message), { status: 400 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: unique constraint violation -> a clean 409, not a generic 500.
    if (err.code === 'P2002') {
      return NextResponse.json(errorEnvelope('CONFLICT', messageForUniqueConstraint(err.meta?.target)), {
        status: 409,
      });
    }
    // P2025: "record to update/delete not found" -- e.g. a delete racing
    // with another delete of the same row. Clean 404, not a 500.
    if (err.code === 'P2025') {
      return NextResponse.json(errorEnvelope('NOT_FOUND', 'The requested record was not found.'), { status: 404 });
    }
  }
  console.error(err);
  return NextResponse.json(errorEnvelope('INTERNAL_ERROR', 'Internal server error'), { status: 500 });
}
