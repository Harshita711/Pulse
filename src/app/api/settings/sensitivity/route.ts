import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleError, requireUserId } from '@/lib/apiHelpers';
import { sensitivitySchema } from '@/lib/validation';
import { CHANGE_THRESHOLDS } from '@/lib/thresholds';

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return NextResponse.json({
      sensitivity: user?.sensitivity,
      // Surface the actual mapping so the settings page can render it
      // honestly instead of re-describing it in prose.
      mapping: CHANGE_THRESHOLDS.sensitivity,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = sensitivitySchema.parse(await req.json());
    const user = await prisma.user.update({ where: { id: userId }, data: { sensitivity: body.sensitivity } });
    return NextResponse.json({ sensitivity: user.sensitivity });
  } catch (err) {
    return handleError(err);
  }
}
