import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { INSTRUMENT_UNIVERSE } from '../src/lib/instrumentUniverse';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding instrument universe...');
  const instruments: Record<string, string> = {};
  for (const seed of INSTRUMENT_UNIVERSE) {
    const instrument = await prisma.instrument.upsert({
      where: { symbol: seed.symbol },
      update: { companyName: seed.companyName, sector: seed.sector },
      create: { symbol: seed.symbol, companyName: seed.companyName, sector: seed.sector, exchange: 'NSE' },
    });
    instruments[seed.symbol] = instrument.id;
  }

  console.log('Seeding demo user (demo@pulse.app / demo1234)...');
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const user = await prisma.user.upsert({
    where: { email: 'demo@pulse.app' },
    update: {},
    create: {
      email: 'demo@pulse.app',
      passwordHash,
      name: 'Demo Investor',
      monthlyIncome: 120000,
      monthlyBudget: 25000,
      sensitivity: 'BALANCED',
      onboardedAt: new Date(),
    },
  });

  const watchlist = await prisma.watchlist.upsert({
    where: { id: `${user.id}-primary` },
    update: {},
    create: {
      id: `${user.id}-primary`,
      userId: user.id,
      name: 'Core Watchlist',
    },
  });

  const demoSymbols = ['RELIANCE', 'TCS', 'HDFCBANK', 'TMPV', 'INFY', 'SUNPHARMA'];
  for (let i = 0; i < demoSymbols.length; i++) {
    const instrumentId = instruments[demoSymbols[i]];
    if (!instrumentId) continue;
    await prisma.watchlistItem.upsert({
      where: { watchlistId_instrumentId: { watchlistId: watchlist.id, instrumentId } },
      update: {},
      create: { watchlistId: watchlist.id, instrumentId, position: i },
    });
  }

  // A real Buy Plan for the demo script (Section 8, step 2): CONSIDERING
  /// TMPV with a target price, reason, and a thesis condition.
  const tmpvId = instruments['TMPV'];
  if (tmpvId) {
    const relationship = await prisma.userInstrumentRelationship.upsert({
      where: { userId_instrumentId: { userId: user.id, instrumentId: tmpvId }},
      update: {},
      create: {
        userId: user.id,
        instrumentId: tmpvId,
        status: 'CONSIDERING',
        reason: 'EV rollout is picking up and the stock has pulled back to a level I like.',
        reconsiderCondition: 'if the auto sector weakens broadly or volume dries up',
        targetPrice: 850,
        plannedAmount: 40000,
      },
    });
    await prisma.relationshipEvent.upsert({
      where: { id: `${relationship.id}-seed-plan` },
      update: {},
      create: {
        id: `${relationship.id}-seed-plan`,
        relationshipId: relationship.id,
        type: 'PLAN_CREATED',
        detail: { targetPrice: 850, plannedAmount: 40000 },
      },
    });
  }

  // An OWN position for the sell-signal panel part of the demo.
  const relianceId = instruments['RELIANCE'];
  if (relianceId) {
    const relationship = await prisma.userInstrumentRelationship.upsert({
      where: { userId_instrumentId: { userId: user.id, instrumentId: relianceId } },
      update: {},
      create: {
        userId: user.id,
        instrumentId: relianceId,
        status: 'OWN',
        quantity: 25,
        avgPrice: 2450,
        targetPrice: 3000,
        trailingStopPct: 8,
        reason: 'Long-term core holding, added on the retail/Jio growth thesis.',
      },
    });
    await prisma.relationshipEvent.upsert({
      where: { id: `${relationship.id}-seed-own` },
      update: {},
      create: {
        id: `${relationship.id}-seed-own`,
        relationshipId: relationship.id,
        type: 'STATUS_CHANGE',
        detail: { to: 'OWN', quantity: 25, avgPrice: 2450 },
      },
    });
  }

  // An earlier real checkpoint so "While You Were Away" has something to diff against.
  await prisma.checkpoint.upsert({
    where: { userId_watchlistId_deviceId: { userId: user.id, watchlistId: watchlist.id, deviceId: 'demo-device' } },
    update: { lastViewedAt: new Date(Date.now() - 20 * 60 * 60 * 1000) },
    create: {
      userId: user.id,
      watchlistId: watchlist.id,
      deviceId: 'demo-device',
      lastViewedAt: new Date(Date.now() - 20 * 60 * 60 * 1000), // ~20h ago
    },
  });

  console.log('Seed complete.');
  console.log('NOTE: no MarketSnapshot rows are seeded -- run `npm run ingest` (or start the');
  console.log('cron) against a real network to populate real prices before demoing, per the');
  console.log('no-fabricated-data constraint.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
