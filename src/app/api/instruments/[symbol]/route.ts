import { NextRequest, NextResponse } from 'next/server';
import { ApiError, handleError, requireUserId } from '@/lib/apiHelpers';
import { getStockDetail } from '@/lib/stockDetailService';

export async function GET(_req: NextRequest, { params }: { params: { symbol: string } }) {
  try {
    const userId = await requireUserId();
    const detail = await getStockDetail(userId, params.symbol);
    if (!detail) throw new ApiError(404, 'Instrument not found');
    return NextResponse.json(detail);
  } catch (err) {
    return handleError(err);
  }
}
