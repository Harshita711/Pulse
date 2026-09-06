# Pulse

**Pulse remembers what you own, what you're waiting for, and what you care about — then watches the real market and tells you when something meaningful changes.**

A conventional watchlist just shows you a price. It has no memory of *why* you added a stock, what you were planning to do about it, or what would actually change your mind — so every session starts from zero, and every price wiggle looks equally important whether you own the stock, are waiting for a dip, or just glanced at it once. Pulse keeps that context (a relationship, a plan, a reconsider-condition) and only raises its hand when a real market event actually touches something you told it you cared about.

Built for the Groww CODE 2026 challenge: *build a smart market watchlist* — not the obvious version.

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

**Worked example:** Reliance moves +1.8% on a day its own average daily move is 1.2% (ratio 1.5× → ~15/30 price points), on 2.1× its average volume (~14/20 volume points), while the NIFTY is flat (a 1.8pt gap → ~6/20), sitting almost exactly on its 20-day average (~1/15 technical), and you own it (10/15 personal). Total ≈ 46 → **Medium**. If you *didn't* own it, personal relevance drops to 2 (watching) or 0 (nothing) and the same day's market action would land in the high 30s — same market, different attention, because Pulse knows your relationship to the stock.

Every score renders with its full five-part breakdown on the stock detail page, plus a one-line plain-language explanation on the dashboard generated per-stock from whichever component is actually elevated (a quiet stock gets an honest *"No unusual activity — trading close to its normal range,"* not a forced explanation).

**The downside-pressure read** (separate from the score, shown alongside it) is a qualitative state — `POSITIVE_PRESSURE | MIXED | ELEVATED_DOWNSIDE | SIGNIFICANT_UNCERTAINTY` — built from price weakness, a volume anomaly, relative underperformance, and a small keyword scan of matched headlines (not sentiment ML). It always ships with: *"This describes what the system currently sees. It does not predict the next price."*

## 2. Checkpoints, and why cross-device matters

A `Checkpoint` is `(userId, watchlistId, deviceId) → lastViewedAt`. It's scoped per device on purpose: if you check Pulse on your phone at breakfast and your laptop at lunch, each device gets its own honest "since you last looked *here*" diff, rather than one device silently marking things as seen on the other's behalf. "While You Were Away" is just this checkpoint compared against `ChangeEvent`/`RelationshipEvent` timestamps — plans reached, thesis flags, high-relevance moves, and an explicit "N stocks were quiet" line, surfaced as its own honest signal rather than hidden noise.

## 3. Data freshness — the one rule that matters most

**Nothing in this app is fabricated.** Every price, volume, and candle traces to a real fetch (Yahoo Finance primary, Alpha Vantage fallback). If both fail, the UI falls back to the **last real persisted `MarketSnapshot`**, labeled `STALE` with its true timestamp — never silently treated as current. If no snapshot has ever existed, it says `UNAVAILABLE`. There is no synthetic-data code path anywhere in this repo.

The AI brief follows the identical rule: it's a real LLM call summarizing numbers already computed for your dashboard (never inventing a fact or a cause), with a ~3s timeout. On any failure, it renders the exact same UI slot with a templated string built from the same facts — a demo-day API hiccup should never produce a broken or fabricated brief.

## 4. What's built

**Foundation:** auth (JWT + refresh rotation, detailed in Section 6), watchlists, real market ingestion with STALE/UNAVAILABLE fallback, the five-component score, per-device checkpoints, dashboard + attention feed, stock detail page.

**Personal layer:** buy/sell plans with target-price tracking and quantity estimation, buy→own and own→closed transitions, personal timeline per stock, thesis memory ("why are you interested" + "what would change your mind"), portfolio with live unrealized gain/loss and concentration warnings, manually-entered budget tracking.

**Breadth:** sector grouping and sector-scoped "don't miss this" (stocks moving alongside ones you already track, that you aren't watching), news-driver matching with hedged "possible driver" language, the downside-pressure read above, a real AI Market Brief with template fallback, in-app notifications with a sensitivity setting (Quiet/Balanced/High), unified search with one-click "add to radar," onboarding, and dark mode (the only mode — a deliberate choice, not an oversight).

**Real-time + mobile:** a background poller refreshing real data ~every 60s, Server-Sent Events pushing changes to connected clients within milliseconds of being computed, and a full installable PWA (manifest, service worker, install prompts for Android/iOS, Groww-inspired dark UI with a bottom tab bar on mobile / left rail on desktop).

The `CorporateEvent` calendar is **deliberately not seeded with placeholder dates** — fabricating fake earnings dates would violate the no-fake-data rule that governs everything else here. It needs a real source wired in (Yahoo's `quoteSummary?modules=calendarEvents` endpoint, or a paid calendar API) before it's populated.

## 5. Architecture

Modular monolith, deliberately not microservices — clean domain boundaries without the operational overhead microservices would add at this scale.

- **Layering:** Next.js API routes with strict `controller → service → repository` separation. A generic repository base (`src/lib/repository.ts`) makes `userId` scoping a type-level requirement, not a convention someone can forget to add — `findById`/`update`/`delete` all require a `userId` and 404 (never 403, so existence isn't leaked) if the row isn't owned by it.
- **Database:** PostgreSQL + Prisma. `onDelete: Restrict` (not `Cascade`) on price-history relations, so deleting a tracked instrument can never silently destroy its historical data. Optimistic concurrency on `MarketSnapshot` via `@@unique([instrumentId, timestamp, source])`, using the *provider's own* reported tick timestamp rather than local fetch-time, so genuinely concurrent fetches of the same tick collide on the constraint instead of duplicating; a `P2002` there is caught and treated as an expected no-op.
- **Market data provider abstraction:** a single interface (`fetchRealQuote`) tries Yahoo Finance first, Alpha Vantage second — swapping in a different provider later (e.g., a paid live feed) means writing one new implementation, not touching anything downstream.
- **Real-time layer:** an in-process event bus publishes every real tick the instant it's persisted; `GET /api/stream` (SSE) pushes it to connected clients scoped to their own watchlists/relationships. This is an enhancement, not a dependency — the dashboard's own polling loop keeps running unconditionally regardless of SSE state, so if the stream never connects, the app degrades to plain polling, nothing breaks. One real architectural consequence: an in-process `EventEmitter` only carries messages within a single Node process, so ingestion runs *inside* the same process that serves `/api/stream` (via `src/instrumentation.ts`), not as a separate container — `docker-compose.yml` reflects this, with no separate ingest sidecar. Scaling the web tier horizontally later means running ingestion as its own process against `POST /api/cron/ingest` on a schedule and swapping the event bus for Redis pub/sub (deliberately Redis-shaped already).
- **Consistent error envelope:** every error response across all API routes returns `{ success: false, error: { code, message }, requestId }`. A real Prisma `P2002` maps to a clean `409` with a specific message; `P2025` (not found) maps to `404`. Verified by constructing actual `Prisma.PrismaClientKnownRequestError` instances and running them through the real error handler, not a hand-typed mock.

## 6. Auth

- **Refresh-token rotation-on-use with reuse-detection revocation**: every `POST /api/auth/refresh` call revokes the presented refresh token and issues a new one in the same rotation "family." If an already-rotated token is ever presented again — the signature of a stolen refresh token being replayed — the entire family is revoked immediately, forcing every device on that chain to re-login. Logout revokes server-side, not just a cleared cookie.
- **No hardcoded fallback secrets.** `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` have no fallback value — the app throws at startup if either is unset, and again at first use as defense in depth.
- **Refresh cookie scoped to `/api/auth`** (not `/`) — only sent to the endpoints that actually need it. The access-token cookie stays scoped to `/`, since it accompanies every request.
- **Client-side silent refresh:** a shared in-flight promise means concurrent 401s across multiple simultaneous requests all await the *same* refresh call rather than each independently triggering one (which would otherwise look like token reuse and trigger a false revocation).

## 7. Getting it running

```bash
cp .env.example .env
# fill in DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, CRON_SECRET
# (generate secrets with: openssl rand -base64 32 — use a different value for each)
# optional: ALPHA_VANTAGE_API_KEY (fallback provider), ANTHROPIC_API_KEY (AI brief —
#   works fine without it, falls back to a template)

npm install
npx prisma generate
npx prisma migrate dev
npm run seed        # 30 real NSE instruments + NIFTY 50 + a demo account (demo@pulse.app / demo1234)
                     # — zero prices seeded, on purpose
npm run backfill    # one-time real ~1-3 month historical depth fill per instrument
npm run ingest      # one real live-quote pass before your first load
npm run dev         # http://localhost:3000 — background polling starts automatically from here
```

**Or with Docker:** `docker compose up` (stop any local Postgres on port 5432 first, or remap the port in `docker-compose.yml`). Polling starts automatically inside the app container — no separate ingest step needed.

**Tests:** `npm test` — 9 real unit tests on the scoring engine (price-move vs. historical average, volume-spike detection, NIFTY-outperformance-beats-isolated-move, all four score bands, OWN > WATCHING personal relevance, thesis-condition matching), no database needed. `npm run test:integration` — the full relationship lifecycle (create → plan → target reached → own → closed, with history preserved) against a real, **separate** database — never point this at your seeded dev data.

## 8. Deliberately not built

- **No free-form "Ask Pulse" chatbot.** Everything else in this app answers from data it's already computing; a chatbot is a genuinely separate product surface with its own prompt design, failure handling, and open-ended-question problem the rest of the app doesn't have. The AI brief gives the "Pulse feels present" quality without that risk.
- **No unrestricted market-wide auto-discovery.** Sector-scoped "don't miss this" gives the real version of this, scoped to the tracked universe — scanning the whole market for "anything interesting" is a materially larger, differently-risky feature.
- **No microservices, no options/derivatives, no broker execution or automatic trading, no OAuth.**

## 9. What genuinely still needs a live environment to verify

This codebase was built and reviewed across sandboxed sessions with no route to Yahoo Finance, Alpha Vantage, or a live browser, and (for part of the process) with a Prisma client generated on a different OS than it ran on — a real `PrismaClientInitializationError` from exactly that mismatch was reproduced and fixed (`binaryTargets` now explicitly lists both `debian-openssl-3.0.x` and `linux-musl-openssl-3.0.x`, since the project's own Dockerfile builds on Alpine/musl).

The scoring engine is proven by real, executable unit tests. Everything else — a real `npm run ingest`/`npm run backfill` producing actual quotes, a full unattended multi-hour poll run, a live 16-minute idle-session token refresh, and the mobile/PWA install experience on an actual phone (safe-area rendering, install prompt, service-worker registration) — is implemented and carefully reviewed, but only proven by running it for real, which no sandbox in this process could do. An explicit per-cycle `[ingest] cycle started/finished` log line exists specifically to make "the scheduler stopped" distinguishable from "the scheduler runs but every fetch fails," since both look identical from the UI (permanently STALE data) but have different fixes.

Budget real time for this pass before treating the app as demo-ready — it's an integration step, not a formality.

## 10. What's next

- Real corporate-events calendar, replacing the currently-empty (not fake) placeholder
- A real edge-level `middleware.ts` auth guard — currently enforced per-route and client-side (both real, neither is edge-level)
- Redis pub/sub in place of the in-process event bus, once running more than one app instance
- Real production icon/design assets, replacing the current generated placeholder mark
- shadcn/ui + TanStack Query, if the hand-rolled equivalents become a maintenance burden