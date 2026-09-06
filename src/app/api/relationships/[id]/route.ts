import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, handleError, requireUserId } from '@/lib/apiHelpers';
import { updateRelationshipSchema } from '@/lib/validation';
import { relationshipRepo } from '@/lib/repositories';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const rel = await relationshipRepo.findById(params.id, userId, { instrument: true });
    return NextResponse.json(rel);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const existing = await relationshipRepo.findById(params.id, userId);
    const body = updateRelationshipSchema.parse(await req.json());

    const statusChanged = body.status && body.status !== existing.status;

    // Addendum 2 Section A2: the relationship update and its audit event
    // must land together or not at all -- otherwise a mid-write failure
    // leaves a status change with no corresponding timeline entry.
    const [updated] = await prisma.$transaction([
      prisma.userInstrumentRelationship.update({
        where: { id: params.id },
        data: body,
        include: { instrument: true },
      }),
      ...(statusChanged
        ? [
            prisma.relationshipEvent.create({
              data: {
                relationshipId: params.id,
                type: 'STATUS_CHANGE' as const,
                detail: { from: existing.status, to: body.status },
              },
            }),
          ]
        : body.targetPrice !== undefined || body.plannedAmount !== undefined
        ? [
            prisma.relationshipEvent.create({
              data: {
                relationshipId: params.id,
                type: 'PLAN_CREATED' as const,
                detail: { targetPrice: body.targetPrice, plannedAmount: body.plannedAmount, updated: true },
              },
            }),
          ]
        : []),
    ]);

    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    await relationshipRepo.findById(params.id, userId);
    const eventCount = await prisma.relationshipEvent.count({ where: { relationshipId: params.id } });
    if (eventCount > 0) {
      throw new ApiError(400, 'This relationship has history and cannot be deleted -- close the position instead.');
    }
    await relationshipRepo.delete(params.id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
