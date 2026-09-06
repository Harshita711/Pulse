import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, handleError, requireUserId } from '@/lib/apiHelpers';
import { buyTransitionSchema } from '@/lib/validation';
import { relationshipRepo } from '@/lib/repositories';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const existing = await relationshipRepo.findById(params.id, userId);
    if (existing.status === 'OWN') throw new ApiError(400, 'This is already marked as owned.');
    if (existing.closedAt) throw new ApiError(400, 'This position is closed.');

    const body = buyTransitionSchema.parse(await req.json());

    // Addendum 2 Section A2: the status flip and its audit event must land
    // together -- an array-form transaction is enough here since neither
    // write depends on output from the other.
    const [updated] = await prisma.$transaction([
      prisma.userInstrumentRelationship.update({
        where: { id: params.id },
        // Keep the old Buy Plan values visible ("previously: target ₹3,000")
        // rather than deleting them -- preserved below in the event detail,
        // and the target/plannedAmount fields on the row aren't cleared.
        data: { status: 'OWN', quantity: body.quantity, avgPrice: body.avgPrice },
        include: { instrument: true },
      }),
      prisma.relationshipEvent.create({
        data: {
          relationshipId: params.id,
          type: 'STATUS_CHANGE',
          detail: {
            from: existing.status,
            to: 'OWN',
            quantity: body.quantity,
            avgPrice: body.avgPrice,
            previousTargetPrice: existing.targetPrice,
            previousPlannedAmount: existing.plannedAmount,
          },
        },
      }),
    ]);

    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}
