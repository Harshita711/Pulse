import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, handleError, requireUserId } from '@/lib/apiHelpers';
import { createWatchlistSchema } from '@/lib/validation';

export async function GET() {
  return withAuth(async (userId) => {
    return prisma.watchlist.findMany({
      where: { userId },
      include: { items: { include: { instrument: true }, orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = createWatchlistSchema.parse(await req.json());
    const watchlist = await prisma.watchlist.create({ data: { userId, name: body.name } });
    return NextResponse.json(watchlist, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
