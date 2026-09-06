import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { jsonError } from '@/lib/apiHelpers';

export async function GET() {
  const auth = await getCurrentUser();
  if (!auth) return jsonError(401, 'Not authenticated');
  const user = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!user) return jsonError(401, 'Not authenticated');
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    sensitivity: user.sensitivity,
    onboarded: !!user.onboardedAt,
    monthlyIncome: user.monthlyIncome,
    monthlyBudget: user.monthlyBudget,
  });
}
