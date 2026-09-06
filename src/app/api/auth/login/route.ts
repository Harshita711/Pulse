import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, issueTokenPair, applyAuthCookies } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { ApiError, handleError } from '@/lib/apiHelpers';

export async function POST(req: NextRequest) {
  try {
    const body = loginSchema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new ApiError(401, 'Invalid email or password');
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) throw new ApiError(401, 'Invalid email or password');

    const { accessToken, refreshToken } = await issueTokenPair(user.id, user.email);
    const res = NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      onboarded: !!user.onboardedAt,
    });
    return applyAuthCookies(res, accessToken, refreshToken);
  } catch (err) {
    return handleError(err);
  }
}
