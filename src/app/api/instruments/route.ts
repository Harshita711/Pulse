import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleError, requireUserId } from '@/lib/apiHelpers';

export async function GET(req: NextRequest) {
  try {
    await requireUserId();
    const q = req.nextUrl.searchParams.get('q');
    const instruments = await prisma.instrument.findMany({
      where: q
        ? {
            OR: [
              { symbol: { contains: q, mode: 'insensitive' } },
              { companyName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { symbol: 'asc' },
    });
    return NextResponse.json(instruments);
  } catch (err) {
    return handleError(err);
  }
}
