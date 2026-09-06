import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleError, requireUserId } from '@/lib/apiHelpers';
import { onboardingSchema } from '@/lib/validation';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = onboardingSchema.parse(await req.json());

    const watchlist = await prisma.watchlist.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });

    for (const [i, pick] of body.picks.entries()) {
      if (watchlist) {
        await prisma.watchlistItem.upsert({
          where: { watchlistId_instrumentId: { watchlistId: watchlist.id, instrumentId: pick.instrumentId } },
          update: {},
          create: { watchlistId: watchlist.id, instrumentId: pick.instrumentId, position: i },
        });
      }
      const existingRel = await prisma.userInstrumentRelationship.findUnique({
        where: { userId_instrumentId: { userId, instrumentId: pick.instrumentId } },
      });
      if (!existingRel) {
        await prisma.userInstrumentRelationship.create({
          data: { userId, instrumentId: pick.instrumentId, status: pick.status },
        });
      }
    }

    await prisma.user.update({ where: { id: userId }, data: { onboardedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
