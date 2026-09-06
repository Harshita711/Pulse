import { NextRequest, NextResponse } from 'next/server';
import { handleError, requireUserId } from '@/lib/apiHelpers';
import { getAttentionFeed, getWhileYouWereAway } from '@/lib/dashboardService';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const deviceId = req.nextUrl.searchParams.get('deviceId') ?? 'default-device';
    let watchlistId = req.nextUrl.searchParams.get('watchlistId');
    if (!watchlistId) {
      const first = await prisma.watchlist.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
      watchlistId = first?.id ?? null;
    }

    const feed = await getAttentionFeed(userId);
    const whileYouWereAway = watchlistId ? await getWhileYouWereAway(userId, watchlistId, deviceId) : null;

    return NextResponse.json({ feed, whileYouWereAway, watchlistId, deviceId });
  } catch (err) {
    return handleError(err);
  }
}
