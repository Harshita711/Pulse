import { NextRequest, NextResponse } from 'next/server';
import { handleError, requireUserId } from '@/lib/apiHelpers';
import { createWatchlistSchema } from '@/lib/validation';
import { watchlistRepo } from '@/lib/repositories';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = createWatchlistSchema.parse(await req.json());
    const updated = await watchlistRepo.update(params.id, userId, { name: body.name });
    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    await watchlistRepo.delete(params.id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
