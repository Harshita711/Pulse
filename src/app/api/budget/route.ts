import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleError, requireUserId } from '@/lib/apiHelpers';
import { getBudgetRollup } from '@/lib/dashboardService';
import { budgetSchema } from '@/lib/validation';

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json(await getBudgetRollup(userId));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = budgetSchema.parse(await req.json());
    await prisma.user.update({ where: { id: userId }, data: body });
    return NextResponse.json(await getBudgetRollup(userId));
  } catch (err) {
    return handleError(err);
  }
}
