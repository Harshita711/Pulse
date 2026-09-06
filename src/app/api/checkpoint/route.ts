import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleError, requireUserId } from '@/lib/apiHelpers';
import { checkpointSchema } from '@/lib/validation';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = checkpointSchema.parse(await req.json());
    const checkpoint = await prisma.checkpoint.upsert({
      where: { userId_watchlistId_deviceId: { userId, watchlistId: body.watchlistId, deviceId: body.deviceId } },
      update: { lastViewedAt: new Date() },
      create: { userId, watchlistId: body.watchlistId, deviceId: body.deviceId, lastViewedAt: new Date() },
    });
    return NextResponse.json(checkpoint);
  } catch (err) {
    return handleError(err);
  }
}
