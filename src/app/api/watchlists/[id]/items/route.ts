import { NextRequest, NextResponse } from 'next/server';
import { ApiError, handleError, requireUserId } from '@/lib/apiHelpers';
import { addWatchlistItemSchema } from '@/lib/validation';
import { watchlistItemRepo } from '@/lib/repositories';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = addWatchlistItemSchema.parse(await req.json());
    const item = await watchlistItemRepo.addItem(params.id, userId, body.instrumentId);
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const instrumentId = req.nextUrl.searchParams.get('instrumentId');
    if (!instrumentId) throw new ApiError(400, 'instrumentId query param required');
    await watchlistItemRepo.removeItem(params.id, userId, instrumentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
