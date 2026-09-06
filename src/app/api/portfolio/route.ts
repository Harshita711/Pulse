import { NextResponse } from 'next/server';
import { handleError, requireUserId } from '@/lib/apiHelpers';
import { getPortfolio } from '@/lib/dashboardService';

export async function GET() {
  try {
    const userId = await requireUserId();
    const positions = await getPortfolio(userId);
    const totalValue = positions.reduce((sum, p) => sum + (p.positionValue ?? 0), 0);
    const totalGain = positions.reduce((sum, p) => sum + (p.unrealizedGain ?? 0), 0);
    return NextResponse.json({
      positions,
      totalValue,
      totalGain,
      label: 'Based on what you entered', // Section 2 item 18: always labeled, never treated as a broker feed
    });
  } catch (err) {
    return handleError(err);
  }
}
