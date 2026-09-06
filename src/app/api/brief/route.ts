import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleError, requireUserId } from '@/lib/apiHelpers';
import { generateBrief, BriefFacts } from '@/lib/brief';
import { getAttentionFeed, getWhileYouWereAway } from '@/lib/dashboardService';

// Section 7C step 4: "Never call this more than once per checkpoint
// refresh -- cache-first." We treat "once per checkpoint refresh" as once
// per this many minutes, which comfortably covers a single dashboard
// session without re-hitting the LLM on every 15-30s poll.
const CACHE_MINUTES = 15;

export async function GET() {
  try {
    const userId = await requireUserId();

    const cached = await prisma.briefCache.findFirst({
      where: { userId, generatedAt: { gte: new Date(Date.now() - CACHE_MINUTES * 60 * 1000) } },
      orderBy: { generatedAt: 'desc' },
    });
    if (cached) {
      return NextResponse.json({ text: cached.text, cached: true });
    }

    const feed = await getAttentionFeed(userId);
    const firstWatchlist = await prisma.watchlist.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
    const away = firstWatchlist
      ? await getWhileYouWereAway(userId, firstWatchlist.id, 'default-device')
      : null;

    const topMoverItem = [...feed].sort(
      (a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0)
    )[0];

    const facts: BriefFacts = {
      topMover: topMoverItem?.changePercent != null ? { symbol: topMoverItem.symbol, changePercent: topMoverItem.changePercent } : null,
      plansReachedCount: away?.plansReached.length ?? 0,
      thesisFlagsCount: away?.thesisFlags.length ?? 0,
      quietCount: away?.quietCount ?? feed.length,
    };

    const result = await generateBrief(facts);

    await prisma.briefCache.create({
      data: { userId, text: result.text, wasFallback: result.wasFallback },
    });

    // wasFallback is logged for our own honesty bookkeeping, never returned to the client.
    return NextResponse.json({ text: result.text, cached: false });
  } catch (err) {
    return handleError(err);
  }
}
