import { NextRequest, NextResponse } from 'next/server';
import { handleError, requireUserId } from '@/lib/apiHelpers';
import { searchInstruments } from '@/lib/dashboardService';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const q = req.nextUrl.searchParams.get('q') ?? '';
    if (q.trim().length === 0) return NextResponse.json([]);
    const results = await searchInstruments(userId, q.trim());
    return NextResponse.json(results);
  } catch (err) {
    return handleError(err);
  }
}
