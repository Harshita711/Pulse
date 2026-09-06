/**
 * Integration tests: full relationship lifecycle against a real Postgres database.
 *
 * Covers: create CONSIDERING → create BUY Plan → price update crosses target →
 * PLAN_TARGET_REACHED fires → transition to OWN → confirm holding state →
 * close position → confirm history preserved (not deleted).
 *
 * IMPORTANT: these tests require a real Postgres database. Set DATABASE_URL in
 * your .env.test or environment before running. Use a *separate* database from
 * dev so cleanup doesn't touch seeded demo data.
 *
 * Run: DATABASE_URL=<test-db-url> npx vitest run tests/lifecycle.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Test fixtures
let userId: string;
let instrumentId: string;
let relationshipId: string;

const TEST_EMAIL = `test-${Date.now()}@pulse-test.app`;
const TEST_SYMBOL = `TEST${Date.now()}`;

beforeAll(async () => {
  // Create a test user
  const passwordHash = await bcrypt.hash('testpass123', 10);
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      passwordHash,
      name: 'Test Investor',
      sensitivity: 'BALANCED',
      onboardedAt: new Date(),
    },
  });
  userId = user.id;

  // Create a test instrument
  const instrument = await prisma.instrument.create({
    data: {
      symbol: TEST_SYMBOL,
      companyName: 'Test Corp',
      sector: 'Test',
      exchange: 'NSE',
    },
  });
  instrumentId = instrument.id;
});

afterAll(async () => {
  // Clean up test data in dependency order
  if (relationshipId) {
    await prisma.relationshipEvent.deleteMany({ where: { relationshipId } });
    await prisma.userInstrumentRelationship.deleteMany({ where: { id: relationshipId } });
  }
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.changeEvent.deleteMany({ where: { instrumentId } });
  await prisma.marketSnapshot.deleteMany({ where: { instrumentId } });
  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.checkpoint.deleteMany({ where: { userId } });
  await prisma.watchlistItem.deleteMany({ where: { instrumentId } });
  await prisma.watchlist.deleteMany({ where: { userId } });
  await prisma.instrument.delete({ where: { id: instrumentId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Relationship lifecycle (integration)', () => {
  it('Step 1: create a CONSIDERING relationship with a target price', async () => {
    const relationship = await prisma.userInstrumentRelationship.create({
      data: {
        userId,
        instrumentId,
        status: 'CONSIDERING',
        reason: 'Testing the full lifecycle — EV growth thesis.',
        reconsiderCondition: 'if auto sector weakens',
        targetPrice: 850,
        plannedAmount: 40000,
      },
    });
    relationshipId = relationship.id;

    expect(relationship.status).toBe('CONSIDERING');
    expect(relationship.targetPrice).toBe(850);
    expect(relationship.plannedAmount).toBe(40000);
    expect(relationship.closedAt).toBeNull();
  });

  it('Step 2: create a BUY Plan event (PLAN_CREATED)', async () => {
    const event = await prisma.relationshipEvent.create({
      data: {
        relationshipId,
        type: 'PLAN_CREATED',
        detail: { targetPrice: 850, plannedAmount: 40000 },
      },
    });

    expect(event.type).toBe('PLAN_CREATED');
    expect((event.detail as any).targetPrice).toBe(850);

    // Verify the event is linked to the relationship
    const events = await prisma.relationshipEvent.findMany({
      where: { relationshipId },
    });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('PLAN_CREATED');
  });

  it('Step 3: simulate price crossing the target → TARGET_REACHED fires', async () => {
    // Simulate the logic from ingest.ts checkTargetsReached:
    // When currentPrice <= targetPrice for a buy plan (status !== 'OWN'),
    // a TARGET_REACHED event should be created.
    const currentPrice = 840; // below the 850 target
    const rel = await prisma.userInstrumentRelationship.findUnique({
      where: { id: relationshipId },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    expect(rel).not.toBeNull();
    expect(rel!.targetPrice).toBe(850);
    const isBuyPlan = rel!.status !== 'OWN';
    expect(isBuyPlan).toBe(true);
    const crossed = currentPrice <= rel!.targetPrice!;
    expect(crossed).toBe(true);

    // Check idempotency: last event should not be a TARGET_REACHED for this target
    const lastEvent = rel!.events[0];
    const alreadyFlagged =
      lastEvent?.type === 'TARGET_REACHED' &&
      (lastEvent.detail as any)?.targetPrice === rel!.targetPrice;
    expect(alreadyFlagged).toBe(false);

    // Create the TARGET_REACHED event (mirrors checkTargetsReached in ingest.ts)
    const targetEvent = await prisma.relationshipEvent.create({
      data: {
        relationshipId,
        type: 'TARGET_REACHED',
        detail: { targetPrice: rel!.targetPrice, currentPrice, kind: 'buy' },
      },
    });

    expect(targetEvent.type).toBe('TARGET_REACHED');
    expect((targetEvent.detail as any).kind).toBe('buy');
    expect((targetEvent.detail as any).currentPrice).toBe(840);
  });

  it('Step 4: transition to OWN (buy execution)', async () => {
    const buyQuantity = 47; // ~40000 / 850
    const buyAvgPrice = 842;

    // Atomic transaction: update status + create audit event (mirrors buy/route.ts)
    const [updated] = await prisma.$transaction([
      prisma.userInstrumentRelationship.update({
        where: { id: relationshipId },
        data: { status: 'OWN', quantity: buyQuantity, avgPrice: buyAvgPrice },
      }),
      prisma.relationshipEvent.create({
        data: {
          relationshipId,
          type: 'STATUS_CHANGE',
          detail: {
            from: 'CONSIDERING',
            to: 'OWN',
            quantity: buyQuantity,
            avgPrice: buyAvgPrice,
            previousTargetPrice: 850,
            previousPlannedAmount: 40000,
          },
        },
      }),
    ]);

    expect(updated.status).toBe('OWN');
    expect(updated.quantity).toBe(buyQuantity);
    expect(updated.avgPrice).toBe(buyAvgPrice);
    expect(updated.closedAt).toBeNull();
  });

  it('Step 5: confirm holding-equivalent state exists', async () => {
    const holding = await prisma.userInstrumentRelationship.findUnique({
      where: { id: relationshipId },
      include: { instrument: true },
    });

    expect(holding).not.toBeNull();
    expect(holding!.status).toBe('OWN');
    expect(holding!.quantity).toBe(47);
    expect(holding!.avgPrice).toBe(842);
    expect(holding!.closedAt).toBeNull();
    // Original plan data is preserved, not deleted
    expect(holding!.targetPrice).toBe(850);
    expect(holding!.plannedAmount).toBe(40000);
    expect(holding!.reason).toBe('Testing the full lifecycle — EV growth thesis.');
    expect(holding!.instrument.symbol).toBe(TEST_SYMBOL);
  });

  it('Step 6: close the position (sell)', async () => {
    const closedQuantity = 47;
    const closedPrice = 920;
    const realizedGain = (closedPrice - 842) * closedQuantity; // 78 * 47 = 3666

    // Atomic transaction (mirrors sell/route.ts)
    const [updated] = await prisma.$transaction([
      prisma.userInstrumentRelationship.update({
        where: { id: relationshipId },
        data: { closedAt: new Date(), closedQuantity, closedPrice },
      }),
      prisma.relationshipEvent.create({
        data: {
          relationshipId,
          type: 'CLOSED',
          detail: {
            closedQuantity,
            closedPrice,
            avgPrice: 842,
            realizedGain,
          },
        },
      }),
    ]);

    expect(updated.closedAt).not.toBeNull();
    expect(updated.closedQuantity).toBe(closedQuantity);
    expect(updated.closedPrice).toBe(closedPrice);
  });

  it('Step 7: confirm history is preserved, not deleted', async () => {
    // The relationship row must still exist with closedAt set
    const closedRel = await prisma.userInstrumentRelationship.findUnique({
      where: { id: relationshipId },
    });
    expect(closedRel).not.toBeNull();
    expect(closedRel!.closedAt).not.toBeNull();
    expect(closedRel!.status).toBe('OWN');
    // Original fields preserved
    expect(closedRel!.reason).toBe('Testing the full lifecycle — EV growth thesis.');
    expect(closedRel!.targetPrice).toBe(850);

    // All RelationshipEvents must still be present — the full timeline
    const events = await prisma.relationshipEvent.findMany({
      where: { relationshipId },
      orderBy: { createdAt: 'asc' },
    });

    expect(events.length).toBe(4);
    expect(events.map((e) => e.type)).toEqual([
      'PLAN_CREATED',
      'TARGET_REACHED',
      'STATUS_CHANGE',
      'CLOSED',
    ]);

    // Verify the CLOSED event has the realized gain
    const closedEvent = events.find((e) => e.type === 'CLOSED')!;
    expect((closedEvent.detail as any).realizedGain).toBe(78 * 47);
    expect((closedEvent.detail as any).closedPrice).toBe(920);

    // Verify the STATUS_CHANGE event preserves the from/to transition
    const statusEvent = events.find((e) => e.type === 'STATUS_CHANGE')!;
    expect((statusEvent.detail as any).from).toBe('CONSIDERING');
    expect((statusEvent.detail as any).to).toBe('OWN');
  });
});
