// One-off demonstration of the real error envelope (Step 3c), run via tsx
// so it can import the project's actual TypeScript source directly. Not a
// live HTTP round-trip (this sandbox can't reach this project's own dev
// server over the network -- see the report), but every function and
// class used here is the real one, not a mock: handleError, ApiError, and
// Prisma.PrismaClientKnownRequestError are all imported from the actual
// project code / the actual generated (well, type-level -- see report)
// Prisma client.
import { handleError, ApiError } from '../lib/apiHelpers';
import { Prisma } from '@prisma/client';

async function show(label: string, res: Response) {
  const body = await res.json();
  console.log(`\n--- ${label} ---`);
  console.log('HTTP status:', res.status);
  console.log(JSON.stringify(body, null, 2));
}

async function main() {
  // Case A: a plain application-level conflict (e.g. relationships/route.ts
  // creating a duplicate relationship, checked explicitly before insert).
  await show('ApiError(409) -- explicit duplicate check', handleError(new ApiError(409, 'A relationship already exists for this instrument. Update it instead.')));

  // Case B: a *real* Prisma unique-constraint violation, constructed via
  // Prisma's own actual error class (not a hand-typed mock of the shape) --
  // this is exactly what a race past the explicit pre-check, or any other
  // unique constraint in schema.prisma, throws.
  const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`watchlistId`,`instrumentId`)', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target: ['watchlistId', 'instrumentId'] },
  });
  await show('Real Prisma P2002 -> mapped to 409', handleError(p2002));

  // Case C: a not-found (e.g. deleting an already-deleted row).
  const p2025 = new Prisma.PrismaClientKnownRequestError('An operation failed because it depends on one or more records that were required but not found.', {
    code: 'P2025',
    clientVersion: '5.22.0',
  });
  await show('Real Prisma P2025 -> mapped to 404', handleError(p2025));

  // Case D: an unrecognized error -> the generic 500 envelope.
  await show('Unknown error -> 500', handleError(new Error('something genuinely unexpected')));

  // For comparison: a real SUCCESS response is untouched -- still the raw
  // resource, no envelope wrapper (Step 3c deliberately only standardizes
  // the error path -- see the comment in apiHelpers.ts for why).
  console.log('\n--- Success response shape (unchanged, for comparison) ---');
  console.log(JSON.stringify({ id: 'wl_abc123', name: 'Core Watchlist', items: [] }, null, 2));
}

main();
