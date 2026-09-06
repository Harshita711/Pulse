import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, handleError, requireUserId } from '@/lib/apiHelpers';
import { sellTransitionSchema } from '@/lib/validation';
import { relationshipRepo } from '@/lib/repositories';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const existing = await relationshipRepo.findById(params.id, userId);
    if (existing.status !== 'OWN') throw new ApiError(400, 'Only an owned position can be marked as sold.');
    if (existing.closedAt) throw new ApiError(400, 'This position is already closed.');

    const body = sellTransitionSchema.parse(await req.json());
    const realizedGain =
      existing.avgPrice != null ? (body.closedPrice - existing.avgPrice) * body.closedQuantity : null;

    // Addendum 2 Section A2: never deleted -- becomes read-only history,
    // and the CLOSED event must land in the same transaction as the close
    // itself (Section 2 item 15's "never deleted" guarantee only holds if
    // the audit trail can't silently go missing).
    const [updated] = await prisma.$transaction([
      prisma.userInstrumentRelationship.update({
        where: { id: params.id },
        data: { closedAt: new Date(), closedQuantity: body.closedQuantity, closedPrice: body.closedPrice },
        include: { instrument: true },
      }),
      prisma.relationshipEvent.create({
        data: {
          relationshipId: params.id,
          type: 'CLOSED',
          detail: {
            closedQuantity: body.closedQuantity,
            closedPrice: body.closedPrice,
            avgPrice: existing.avgPrice,
            realizedGain,
          },
        },
      }),
    ]);

    return NextResponse.json({ ...updated, realizedGain });
  } catch (err) {
    return handleError(err);
  }
}
