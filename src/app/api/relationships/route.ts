import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, handleError, requireUserId } from '@/lib/apiHelpers';
import { createRelationshipSchema } from '@/lib/validation';
import { relationshipRepo } from '@/lib/repositories';

// Addendum 2 Section A4: cursor/limit pagination instead of an unbounded list.
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const statusFilter = req.nextUrl.searchParams.get('status');
    const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined;
    const limit = Number(req.nextUrl.searchParams.get('limit') ?? 20);

    const page = await relationshipRepo.list(
      userId,
      statusFilter ? { status: statusFilter } : {},
      { cursor, limit }
    );
    // include instrument on each row -- list() doesn't take an include param
    // directly, so hydrate it here in one extra query rather than N+1ing.
    const withInstrument = await prisma.userInstrumentRelationship.findMany({
      where: { id: { in: page.items.map((r) => r.id) } },
      include: { instrument: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ items: withInstrument, nextCursor: page.nextCursor });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = createRelationshipSchema.parse(await req.json());

    const existing = await prisma.userInstrumentRelationship.findUnique({
      where: { userId_instrumentId: { userId, instrumentId: body.instrumentId } },
    });
    if (existing) {
      throw new ApiError(409, 'A relationship already exists for this instrument. Update it instead.');
    }

    // Addendum 2 Section A2: the relationship row and its PLAN_CREATED audit
    // event are written in one atomic transaction. The event depends on the
    // relationship's generated id, so this uses the interactive-transaction
    // form (a callback) rather than an array of independent writes -- if the
    // event write fails, the relationship create is rolled back too, rather
    // than leaving a plan with a silently-missing timeline entry.
    const hasPlan = !!(body.targetPrice || body.plannedAmount);
    const relationship = await prisma.$transaction(async (tx) => {
      const created = await tx.userInstrumentRelationship.create({
        data: { userId, ...body },
        include: { instrument: true },
      });
      if (hasPlan) {
        await tx.relationshipEvent.create({
          data: {
            relationshipId: created.id,
            type: 'PLAN_CREATED',
            detail: { targetPrice: body.targetPrice, plannedAmount: body.plannedAmount, status: body.status },
          },
        });
      }
      return created;
    });

    return NextResponse.json(relationship, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
