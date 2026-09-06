import { NextRequest, NextResponse } from 'next/server';
import { handleError, requireUserId } from '@/lib/apiHelpers';
import { getTimeline } from '@/lib/dashboardService';
import { ApiError } from '@/lib/apiHelpers';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const limit = Number(req.nextUrl.searchParams.get('limit') ?? 50);
    const before = req.nextUrl.searchParams.get('before') ?? undefined;
    const timeline = await getTimeline(userId, params.id, { limit, before });
    if (!timeline) throw new ApiError(404, 'Relationship not found');
    return NextResponse.json(timeline);
  } catch (err) {
    return handleError(err);
  }
}
