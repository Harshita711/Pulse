import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, issueTokenPair, applyAuthCookies } from '@/lib/auth';
import { registerSchema } from '@/lib/validation';
import { ApiError, handleError } from '@/lib/apiHelpers';

export async function POST(req: NextRequest) {
  try {
    const body = registerSchema.parse(await req.json());
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new ApiError(409, 'An account with this email already exists');
    }
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: { email: body.email, passwordHash, name: body.name },
    });
    await prisma.watchlist.create({ data: { userId: user.id, name: 'My Watchlist' } });

    const { accessToken, refreshToken } = await issueTokenPair(user.id, user.email);
    const res = NextResponse.json({ id: user.id, email: user.email, name: user.name });
    return applyAuthCookies(res, accessToken, refreshToken);
  } catch (err) {
    return handleError(err);
  }
}
