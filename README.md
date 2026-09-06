# Pulse

**Pulse remembers what you own, what you're waiting for, and what you care about — then watches the real market and tells you when something meaningful changes.**

A conventional watchlist just shows you a price. It has no memory of *why* you added a stock, what you were planning to do about it, or what would actually change your mind — so every session starts from zero, and every price wiggle looks equally important whether you own the stock, are waiting for a dip, or just glanced at it once. Pulse keeps that context (a relationship, a plan, a reconsider-condition) and only raises its hand when a real market event actually touches something you told it you cared about.

---

## 1. The score, in plain language

Every instrument gets an **attention score, 0–100**, built from five components:

| Component | What it measures | Max points |
|---|---|---|
| Price move | Today's % move vs. this stock's own average daily move | 30 |
| Volume | Today's volume vs. its 20-day average | 20 |
| Vs. NIFTY | How far today's move diverges from the NIFTY 50, either direction | 20 |
| Technical | Distance from the 20-day moving average | 15 |
| Personal relevance | Do *you* actually have a stake in this — own it, waiting near your target, watching, or nothing | 15 |

Bands: **0–29 Low, 30–59 Medium, 60–79 High, 80–100 Critical.**

**Worked example:** Reliance moves +1.8% on a day its own average daily move is 1.2% (ratio 1.5x → ~15/30 price points), on 2.1x its average volume (~14/20 volume points), while the NIFTY is flat (a 1.8pt gap → ~6/20), sitting almost exactly on its 20-day average (~1/15 technical), and you own it (10/15 personal). Total ≈ 46 → **Medium**. If you *didn't* own it, personal relevance drops to 2 (watching) or 0 (nothing) and the same day's market action would land in the high 30s — same market, different attention, because Pulse knows your relationship to the stock.

**The downside-pressure read** (separate from the score, shown alongside it) is a qualitative state — `POSITIVE_PRESSURE | MIXED | ELEVATED_DOWNSIDE | SIGNIFICANT_UNCERTAINTY` — built from price weakness, a volume anomaly, relative underperformance, and a small keyword scan of matched headlines (not sentiment ML). It always ships with: *"This describes what the system currently sees. It does not predict the next price."*

## 2. Checkpoints, and why cross-device matters

A `Checkpoint` is `(userId, watchlistId, deviceId) → lastViewedAt`. It's scoped per device on purpose: if you check Pulse on your phone at breakfast and your laptop at lunch, each device gets its own honest "since you last looked *here*" diff, rather than one device silently marking things as seen on the other's behalf. "While You Were Away" is just this checkpoint compared against `ChangeEvent`/`RelationshipEvent` timestamps — plans reached, thesis flags, high-relevance moves, and an explicit "N stocks were quiet" line, which is the same query surfaced as its own honest signal rather than hidden noise.

## 3. Data freshness — the one rule that matters most

**Nothing in this app is fabricated.** Every price, volume, and candle traces to a real fetch (Yahoo Finance primary, Alpha Vantage fallback). If both fail, the UI falls back to the **last real persisted `MarketSnapshot`**, labeled `STALE` with its true timestamp — never silently treated as current. If no snapshot has ever existed, it says `UNAVAILABLE`. There is no synthetic-data code path anywhere in this repo.

The AI brief follows the identical rule: it's a real LLM call summarizing numbers already computed for your dashboard (never inventing a fact or a cause), with a ~3s timeout. On any failure, it renders the exact same UI slot with a templated string built from the same facts — `wasFallback` is logged for our own bookkeeping and never shown to you. A demo-day API hiccup should never produce a broken or fabricated brief.

## 4. Two deliberate cuts (not oversights)

- **No "Ask Pulse" free-form chatbot.** Everything else in this app reads from data it's already computing. A chatbot is a genuinely new product surface — its own prompt design, its own failure handling, open-ended questions it has no structured answer for. The AI brief gives you "Pulse feels present" without that risk.
- **No unrestricted sector/market auto-discovery.** The sector-scoped "don't miss this" (Tier 3) gives you the real version of this, scoped to the fixed seeded universe. Scanning the open market for "anything interesting" is a materially larger, differently-risky feature.

## 5. What's actually built, and what a fresh clone needs before it's real

This repository was built in a sandboxed environment with **no access to Yahoo Finance, Alpha Vantage, NewsAPI, or the Prisma engine binary host** (only npm/PyPI/GitHub-style package registries were reachable). That means:

- The **scoring engine is fully implemented and unit-tested** — `npm test` passes 9/9 real tests against the exact cases required (5% vs 1.5% move, 3x volume spike, NIFTY-outperformance-beats-isolated-move, all four band boundaries, OWN > WATCHING personal relevance, thesis-condition matching).
- Every API route, the Prisma schema, and every page described below is written and hand-reviewed, but **`npx prisma generate`, a live `next build`, and a live market-data fetch were never exercised in this sandbox** — the schema and TypeScript were checked as carefully as possible by hand, but you should treat first boot as an integration step, not a formality. Budget 30–60 minutes for "make the pieces meet for the first time" issues before treating this as demo-ready.
- **Tier 1 (Foundation) and Tier 2 (Personal layer)** are code-complete: auth, watchlists, real market ingestion with STALE/UNAVAILABLE fallback, the five-component score, checkpoints, dashboard + attention feed, stock detail page, buy/sell plans with quantity estimation, buy→own and own→closed transitions, personal timeline, thesis memory, portfolio + concentration, "While You Were Away," and 15–20s polling.
- **Tier 3 (Breadth)** is also code-complete: sector grouping, sector-scoped "don't miss this," news-driver matching, downside-pressure read, corporate events calendar, the real AI brief with fallback, notifications + sensitivity settings, unified search with one-click "add to radar," onboarding, dark mode (the only mode — see below), and the budget layer.
- **Simplifications from the original spec**, stated plainly: the UI is hand-built with Tailwind rather than shadcn/ui (faster to build correctly, same design-token approach); there's no server-side `middleware.ts` route guard yet (pages guard client-side via `/api/auth/me`, and every API route independently checks auth + ownership, so nothing is actually exposed — it's a UX nicety, not a security gap); live-updates use a plain `setInterval` poll rather than TanStack Query (same effect, less infrastructure).
- The `CorporateEvent` calendar is **not seeded with placeholder dates** — seeding fake earnings dates would violate the no-fabricated-data rule that governs everything else here. Wire up a real fetch (Yahoo's `quoteSummary?modules=calendarEvents` endpoint) or a paid calendar API before relying on it.

## 6. How to run it

```bash
cp .env.example .env        # fill in DATABASE_URL at minimum; everything else has an honest fallback
npm install
npx prisma migrate dev      # creates the schema
npm run seed                # seeds the 30-stock NSE universe + a demo account (demo@pulse.app / demo1234)
npm run backfill            # one-time real historical depth fill (~1-3mo of daily candles per instrument)
npm run ingest              # one real live-quote pass — do this before your first dashboard load, or every
                             # instrument will honestly show UNAVAILABLE, which is correct but not a great demo
npm run dev                 # http://localhost:3000
```

For continuous ingestion instead of running `npm run ingest` by hand: as of Addendum 2, `docker compose up` (or just `npm run dev`/`npm start`) starts polling automatically in-process — see Section 8 below for why. For serverless deploys, hit `POST /api/cron/ingest` (protected by `CRON_SECRET`) from an external scheduler instead.

Run the scoring engine's unit tests any time with `npm test` (fast, no database needed). The full relationship-lifecycle integration test is separate on purpose — `npm run test:integration` — and needs its own `DATABASE_URL` pointed at a database you don't mind writing test rows into; see the warning at the top of `tests/lifecycle.integration.test.ts`.

**Before you demo:** actually run `npm run ingest` against a real internet connection first — this app was built somewhere that couldn't reach Yahoo Finance, so this exact path is the one thing that most needs a live smoke-test on your machine (see Section 5 above, and Tier 1 item 3's "spike this first" instruction, which is doubly true here since it was never spiked at all).

## 8. Addendum 2 — hardened CRUD, real-time push, Groww-inspired redesign, PWA

This section documents what changed on top of everything above.

### CRUD hardening (Section A)
- **Generic repository base** (`src/lib/repository.ts`): every direct-userId model (relationships, watchlists, notifications) now goes through `createRepository()`, whose `findById`/`update`/`delete` all require a `userId` and 404 if the row isn't owned by it — the IDOR check is in the type signature, not hand-written per route. `WatchlistItem` (no direct `userId` column) goes through its parent watchlist's repository instead (`watchlistItemRepo` in `src/lib/repositories.ts`).
- **Transactions**: relationship creation (+ its `PLAN_CREATED` event), buy→own, own→closed, and any relationship update that also logs an event now use `prisma.$transaction(...)` — a mid-write failure can no longer leave a status change with a missing timeline entry.
- **Optimistic concurrency on `MarketSnapshot`**: `@@unique([instrumentId, timestamp, source])`, using the *provider's own* reported tick timestamp (Yahoo's `regularMarketTime`) rather than our local fetch-time clock, so two genuinely-concurrent fetches of the same tick collide on the constraint instead of creating near-duplicate rows. `ingest.ts` catches Prisma's `P2002` and treats it as an expected no-op.
- **Pagination**: `GET /api/relationships`, `GET /api/notifications`, and `GET /api/relationships/:id/timeline` all now accept `cursor`/`limit` (the timeline uses a timestamp-based `before` cursor instead, since it merges two heterogeneous tables).
- **Write/read separation**: already true architecturally before this addendum — ingestion (`ingest.ts`, `/api/cron/ingest`) is the only code path that ever calls the market-data fetchers or writes `MarketSnapshot`/`ChangeEvent`; every dashboard/stock-detail read is Prisma-only.
- **Connection pooling**: `.env.example`'s `DATABASE_URL` now sets `connection_limit` explicitly; see the comment there for the ingestion-vs-API-server pool contention this addresses.

### Real-time push layer (Section B)
The ingestion poll is still the ceiling on data freshness (15–60s against free providers, whatever you set `INGEST_INTERVAL_SECONDS` to) — that hasn't changed and can't, without a paid feed. What's new is *distribution*: every real tick is published to an in-process event bus (`src/lib/eventBus.ts`) the instant it's persisted, and `GET /api/stream` (Server-Sent Events) pushes it to every open connection whose user has that instrument in a watchlist or relationship. A connected client sees an update within milliseconds of the server computing it, instead of waiting up to a full poll cycle on its own. **This is an enhancement, not a dependency**: the dashboard and stock-detail pages keep their original 20s polling loop running unconditionally regardless of SSE state, so if the stream never connects (or the browser doesn't support it), the app degrades to exactly the polling behavior from Addendum 1 — nothing breaks.

**The one non-obvious architectural consequence**: an in-process `EventEmitter` only carries messages within a single Node process, so ingestion now runs *inside* the same process that serves `/api/stream`, via `src/instrumentation.ts` (Next.js's server-boot hook) rather than as a separate container. `docker-compose.yml` was simplified accordingly — the old separate `ingest` sidecar is gone; polling starts automatically when the `app` container boots. If you ever scale the web tier horizontally, set `ENABLE_INPROCESS_INGEST=false`, run ingestion as its own single-replica process against `POST /api/cron/ingest` on a schedule, and swap `eventBus.ts` for Redis pub/sub (its publish/subscribe shape is deliberately Redis-shaped already, to make that swap mechanical).

**Important, easy-to-miss config requirement**: `instrumentation.ts` only runs at all on Next.js 14.x if `experimental.instrumentationHook: true` is set in `next.config.js` (already done here) — it stabilizes in Next 15. Without it, `register()` silently never fires and ingestion never starts, with no error anywhere; if live updates ever stop working after a Next.js upgrade or config change, check this first.

On mobile, backgrounded tabs get their SSE connection torn down by the OS without warning. `useLiveUpdates` (`src/lib/useLiveUpdates.ts`) reconnects on `visibilitychange` and tells the caller to re-fetch full state immediately, rather than trusting any events missed while backgrounded to replay.

### Groww-inspired redesign (Section C)
The palette, feed-row layout, and navigation structure changed; the underlying Tailwind token *names* mostly didn't (`ink-*`, `signal`, `gain`, `loss` still resolve, just to new hex values — see `tailwind.config.ts`), which is why this was a palette/structure change rather than a full component rewrite. Concretely: the single accent is Groww's `#5DB85D` green (CTAs, positive movement, active nav — never used decoratively elsewhere); font is Inter throughout (replacing the earlier IBM Plex pairing), with Tailwind's `tabular-nums` applied to every price/score value so digit columns don't jitter horizontally on a live update; the attention feed row now leads with price (large, bold, tabular-nums) and change% as the dominant visual elements, with a one-line "why it's here" surfaced whenever the score clears LOW; and the top nav bar was replaced by `src/components/AppShell.tsx` — a left rail on desktop (`sm:` and up) and a bottom tab bar on mobile, both driven by the same five-section list, with 44×44px minimum touch targets and `env(safe-area-inset-bottom)` padding on the bottom bar so it clears the iOS home-indicator gesture area. The live-update flash (green on an uptick, red on a downtick, ~500ms fade) is driven by the SSE layer above landing on a row/price header that's already rendered.

Dark mode is the only mode, per the addendum's explicit instruction — there's no light-theme toggle anywhere, and that's a decision, not an oversight.

### PWA (Section D)
`public/manifest.json`, `public/sw.js` (app-shell-only cache, explicitly never intercepts `/api/*` — see the comment in that file for why: caching API responses would silently violate the no-fake-data rule by serving old prices without the honest STALE label), real generated icons at `public/icons/` (192/512/maskable — actually rendered, not placeholder links; see below), the iOS meta tags and `apple-touch-icon` (via Next's `Metadata.appleWebApp`/`icons.apple` fields in `layout.tsx`, which emit the same tags the addendum specifies), an install-prompt component (`src/components/InstallPrompt.tsx`) handling both the Android `beforeinstallprompt` flow and an iOS instructional card, and the mobile-backgrounding SSE reconnect described above. The install prompt only appears past onboarding, not on first load, and remembers a dismissal in `localStorage`.

**Icon provenance**: the three PNGs in `public/icons/` were generated in this build session with Pillow (a simple pulse-line mark on the brand colors) rather than left as broken links — but they're a placeholder brand mark, not real design work. Swap them for real icon assets before shipping.

### What wasn't done in this pass
- The SSE layer was never live-tested against a real browser/EventSource connection or a real concurrent-write race on `MarketSnapshot` — both were built and reviewed carefully by hand (same sandbox networking constraint as Addendum 1's Section 5), but budget time to verify them for real, especially the `instrumentationHook` requirement above.
- The repository-base pattern was applied to relationships, watchlists, and notifications; `Checkpoint` and `BriefCache` still write through Prisma directly in their respective routes rather than through a repo instance — both are simple enough (one row per user-scoped key) that it wasn't worth the ceremony, but it'd be a quick follow-up for consistency.
- No separate SSE reconnect/backoff tuning beyond native `EventSource` defaults + the visibilitychange handler — fine for a demo, worth revisiting under real mobile network conditions.

## 8b. Auth hardening (post-Addendum-2 correction)

Three corrections applied after review, on top of everything in Section 8:

- **Refresh-token rotation-on-use, with reuse-detection revocation, is now actually implemented** — this was previously deferred (framed as "the one deliberate security downgrade," per the original build prompt's Section 6). That framing is gone because the thing it excused is now built: every `POST /api/auth/refresh` call revokes the presented refresh token and issues a new one in the same rotation "family" (`RefreshToken` model in `prisma/schema.prisma`; logic in `src/lib/auth.ts`'s `issueTokenPair`/`rotateRefreshToken`/`revokeRefreshToken`). If an already-rotated token is ever presented again — the signature of a leaked/stolen refresh token being replayed — the entire family is revoked immediately, forcing every device on that chain to log in again. Logout revokes the current token server-side rather than just clearing the cookie.
- **No hardcoded fallback secrets.** `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` have no `?? 'dev-secret-...'` fallback anymore — `src/lib/env.ts`'s `validateEnv()` throws at server startup (called from `src/instrumentation.ts`, which runs at boot, not at `next build` time — see the comment in `env.ts` for why that distinction matters for a Dockerized deploy) if either is unset, and `getRequiredEnv()` throws at first use as defense in depth.
- **Refresh cookie scoped to `/api/auth`** (not `/`) — it's now only ever sent to the auth endpoints that actually need it (`refresh`, `logout`), narrowing where a stolen cookie would even be usable. The access-token cookie stays scoped to `/`, since it needs to accompany every request.

## 10. Addendum 3 — verification pass, historical backfill, error envelope, per-stock explanations

This section covers a full re-verification of Addendum 2's fixes against real generated Prisma types (the first time that was possible for this project — see "how this was verified" below), plus new work.

### Re-verified against real code, not re-asserted
All five items from the prior correction pass were re-checked directly against the real files: client-side refresh-on-401 with a shared in-flight promise, the cron endpoint failing closed when `CRON_SECRET` is unset, atomic (`updateMany`-with-count) refresh-token rotation with family-wide reuse-detection revocation, `lightweight-charts` with an explicit `height` on `createChart()`, and a real integration test covering the full relationship lifecycle. All five were already correct. Two things surfaced only because a real generated Prisma client happened to be available this time: a broken import (`lightweight-charts` doesn't export a `LineSeries` type) and a genuine TypeScript bug in `dashboardService.ts`'s `getTimeline` (a `kind: 'relationship'` literal silently widened to `string` by a TS quirk around mixed array-literal spreads, missing the `as const` its sibling branches had). Both fixed; `npx tsc --noEmit` is clean for the first time this project has had real types to check against.

Also split `vitest.config.ts` so the integration test can never be picked up by plain `npm test` (which must never depend on a real database) — a new `vitest.integration.config.ts` + `npm run test:integration` is the only thing that runs it.

### Market data reliability
`src/lib/marketData.ts`: the User-Agent previously self-identified as `PulseApp/1.0` (not actually browser-like); replaced with a realistic Chrome-on-Windows string. Added real exponential-backoff retry (3 attempts: 500ms/1s/2s) on both providers before falling back/giving up — there was previously no retry logic at all, a single transient blip returned `null` immediately.

Also added `binaryTargets = ["native", "debian-openssl-3.0.x", "linux-musl-openssl-3.0.x"]` to the Prisma generator block — this project's own Dockerfile builds on `node:20-alpine` (musl, not glibc), and without an explicit multi-target list a client generated on one OS throws `PrismaClientInitializationError` on another. Directly reproduced this exact error while reviewing a copy of this project's `node_modules` that had been generated on Windows.

### Historical backfill (`src/lib/backfill.ts`, `npm run backfill`)
Confirmed this gap was real: the live poller fetches ~3 months of daily history from Yahoo on *every* cycle (to compute `avg20DayVolume`/`avgDailyMovePct`/`ma20`) but only ever persisted "today's" tick — a freshly-added instrument's chart was only ever as deep as however long the poller had been running since it was added. Fixed with a one-time backfill that reuses the exact same real fetch (no new provider call shape needed) and persists each real historical day as its own `MarketSnapshot` row, tagged `source: 'yahoo_historical'` to distinguish it from the live poller's `'yahoo'`/`'alpha_vantage'`. Idempotent two ways: skips instruments that already have enough depth, and relies on the existing `(instrumentId, timestamp, source)` unique constraint (`skipDuplicates: true`) so a re-run can't double-insert. Run it once, right after seeding: `npm run seed && npm run backfill`.

### Consistent error envelope (`src/lib/apiHelpers.ts`)
Every error response across all 28 API routes now returns `{ success: false, error: { code, message }, requestId }` — previously ad-hoc (`{ error: string }`, inconsistently shaped, in a few places constructed inline instead of through the shared helper). A real Prisma `P2002` (unique constraint violation) now maps to a clean `409` with a constraint-specific friendly message (e.g. "This instrument is already in this watchlist.") instead of falling through to a generic `500`; `P2025` (record not found) maps to `404`. Success responses are unchanged (still the raw resource) — only the error path was ad-hoc, so only the error path was standardized. Verified with real output: constructed actual `Prisma.PrismaClientKnownRequestError` instances (not a hand-typed mock of the JSON shape) and ran them through the real `handleError()` — see `src/scripts/demo_envelope.ts`. A thorough multi-line-aware scan (a plain single-line grep initially missed one instance split across lines) confirms zero routes still construct an error response outside this helper.

### Dashboard: sparkline + real per-stock explanation
Each attention-feed row now shows a small real sparkline (last ~30 persisted price points — bounded by row count rather than a time window, so it gracefully adapts to whatever depth actually exists: daily bars post-backfill, finer-grained once live polling accumulates, a short real series for a freshly-added instrument) and a one-sentence explanation generated per-stock from whichever score component is actually elevated, using the real underlying numbers (today's % move vs. its own average, the live volume-vs-20-day-average ratio, the point gap vs. NIFTY) rather than a generic label. A quiet stock explicitly gets "No unusual activity — trading close to its normal range." rather than nothing. The full numeric score breakdown was moved off the homepage entirely — it's stock-detail-page-only now, per the redesign brief.

### On-demand refresh + explicit per-cycle logging
Added a fire-and-forget on-demand refresh: when a dashboard or stock-detail read finds its snapshot older than 5 minutes, it kicks off a background fetch for just that instrument without blocking the response — a safety net independent of the scheduled poll, so a stalled scheduler doesn't compound into a full day of staleness before anyone notices. Deliberately non-blocking to preserve this project's own earlier principle (Addendum 2, Section A5) that a page read must never wait on a live fetch. Also added an unambiguous `[ingest] cycle started` / `[ingest] cycle finished` log line on every poll cycle, independent of success or failure, specifically so "the scheduler stopped firing" can be told apart from "the scheduler fires every cycle but every fetch is failing" — the two look identical from the UI (both show permanently STALE data) but have completely different fixes.

**What this did and didn't establish about a live "stuck stale" report**: started the real dev server during this review and captured real log output — `[instrumentation] starting in-process ingestion loop, every 60s` fired correctly, meaning the specific failure mode of the instrumentation hook silently never registering is *not* what's happening in this codebase as it currently stands (`experimental.instrumentationHook` is set, `register()` runs, the loop starts). That doesn't explain a staleness report observed elsewhere — the most likely candidates are the same Windows/Linux Prisma binary mismatch reproduced above (now fixed via `binaryTargets`), or a genuine Yahoo Finance connectivity issue specific to that network, neither of which is reproducible from this sandbox (no real Postgres, no route to `query1.finance.yahoo.com`/`www.alphavantage.co`).

### What I could not verify live, and why
This sandbox has no real PostgreSQL, no route to the actual market data providers, and (for part of this review) was working from a `node_modules` generated on a different OS. That means the following are implemented and reviewed carefully, but **not proven by execution** the way the scoring engine's unit tests are: a real `npm run ingest`/`npm run backfill` producing real quotes, a live 16-minute idle-session token refresh, and the mobile/PWA experience in an actual browser (install prompt, safe-area rendering, service-worker registration). The manifest, service worker, and responsive layout are all statically verified to be correct and consistent with each other — but "the file is correct" and "a phone actually does the right thing with it" are different claims, and only one of them was checked here.

## 11. What's next

- Ask-Pulse chatbot and unrestricted market-wide discovery (deliberately deferred, see Section 4)
- A real `middleware.ts` edge guard (currently client + per-route enforced, not edge-enforced)
- Swap the seeded/never-fetched `CorporateEvent` calendar for a real source
- Real icon assets in `public/icons/`, replacing the generated placeholder mark
- Redis pub/sub in place of the in-process event bus, once running more than one app replica
- shadcn/ui + TanStack Query, if the hand-rolled equivalents ever become a maintenance burden

