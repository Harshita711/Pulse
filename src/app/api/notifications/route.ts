import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleError, requireUserId } from '@/lib/apiHelpers';
import { z } from 'zod';

// Addendum 2 Section A4: cursor/limit pagination instead of an unbounded list.
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const onlyStored = req.nextUrl.searchParams.get('storedOnly') === 'true';
    const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined;
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 20), 100);

    const rows = await prisma.notification.findMany({
      where: { userId, ...(onlyStored ? { priority: 'STORED' } : {}) },
      include: { instrument: true },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return NextResponse.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
  } catch (err) {
    return handleError(err);
  }
}

const markReadSchema = z.object({ ids: z.array(z.string()).min(1) });

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = markReadSchema.parse(await req.json());
    await prisma.notification.updateMany({
      where: { id: { in: body.ids }, userId },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
