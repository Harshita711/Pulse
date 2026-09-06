// HARD CONSTRAINT: no simulated/mocked market data, anywhere. Every value
// returned from this file traces to a real HTTP fetch. If both providers
// fail after retrying, functions here return null -- callers fall back to
// the last persisted MarketSnapshot (labeled STALE), never to an invented
// number.
//
// Note on this sandbox: query1.finance.yahoo.com and www.alphavantage.co are
// not on this build environment's egress allowlist, so this code path could
// not be live-fetch-tested from here. It's written against the real,
// documented shapes of both APIs and should be smoke-tested against the
// network the app actually runs on (see README "Spike this first").

export interface DailyBar {
  date: string; // ISO date
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RawQuote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  changePercent: number;
  source: 'yahoo' | 'alpha_vantage';
  history: DailyBar[]; // trailing daily bars, most recent last (may be empty for alpha_vantage)
  // The provider's own reported timestamp for this tick, when available.
  // Used (not our local fetch-time clock) as MarketSnapshot.timestamp so
  // two near-simultaneous fetches of the *same* underlying tick collide on
  // the (instrumentId, timestamp, source) unique constraint instead of
  // creating two near-duplicate rows a few hundred ms apart (Addendum 2
  // Section A3).
  marketTimestamp: Date | null;
}

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

// A genuinely browser-like UA, not one that announces itself as a bot/app.
// Yahoo's unofficial endpoint is known to be more likely to rate-limit or
// block requests that self-identify as non-browser clients.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function toNSESymbol(symbol: string): string {
  return symbol.includes('.') ? symbol : `${symbol}.NS`;
}

interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
}

/**
 * Retries `fn` with exponential backoff -- 3 attempts by default at 500ms,
 * 1s, 2s. Treats a thrown error (non-2xx response, timeout, unparseable
 * body -- see the `attempt*` functions below, which throw rather than
 * return null on any of these so this wrapper can tell "transient failure,
 * worth retrying" apart from "provider doesn't have this symbol") the same
 * as an exhausted retry budget: after the last attempt fails, returns null
 * rather than throwing, so callers keep their existing "null means try the
 * next provider / fall back to STALE" contract unchanged.
 */
async function withRetry<T>(fn: () => Promise<T>, { attempts = 3, baseDelayMs = 500 }: RetryOptions = {}): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch {
      if (i < attempts - 1) {
        const delay = baseDelayMs * Math.pow(2, i); // 500ms, 1000ms, 2000ms
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  return null;
}

async function attemptYahooFetch(displaySymbol: string, ySymbol: string): Promise<RawQuote> {
  const url = `${YAHOO_BASE}/${encodeURIComponent(ySymbol)}?range=3mo&interval=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Yahoo chart endpoint responded ${res.status}`);

  const json = await res.json(); // throws on unparseable body -- caught by withRetry, treated as retryable
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Yahoo chart endpoint returned no result for this symbol');

  const meta = result.meta;
  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  const opens: (number | null)[] = quote?.open ?? [];
  const highs: (number | null)[] = quote?.high ?? [];
  const lows: (number | null)[] = quote?.low ?? [];
  const closes: (number | null)[] = quote?.close ?? [];
  const volumes: (number | null)[] = quote?.volume ?? [];

  const history: DailyBar[] = timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: opens[i],
      high: highs[i],
      low: lows[i],
      close: closes[i],
      volume: volumes[i],
    }))
    .filter((b): b is DailyBar => b.close != null && b.volume != null && b.open != null && b.high != null && b.low != null);

  if (history.length === 0) throw new Error('Yahoo chart endpoint returned an empty history array');

  const price = meta.regularMarketPrice ?? history[history.length - 1].close;
  const previousClose = history[history.length - 2]?.close ?? meta.previousClose ?? price;
  const changePercent = previousClose ? ((price - previousClose) / previousClose) * 100 : 0;

  return {
    symbol: displaySymbol,
    price,
    open: meta.regularMarketOpen ?? history[history.length - 1].close,
    high: meta.regularMarketDayHigh ?? price,
    low: meta.regularMarketDayLow ?? price,
    previousClose,
    volume: meta.regularMarketVolume ?? history[history.length - 1].volume,
    changePercent,
    source: 'yahoo',
    history,
    marketTimestamp: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : null,
  };
}

/** Primary source: Yahoo Finance's unofficial chart endpoint. No API key required. Retries with backoff. */
export async function fetchYahooQuote(symbol: string): Promise<RawQuote | null> {
  return fetchYahooQuoteExact(symbol, toNSESymbol(symbol));
}

/** Same as fetchYahooQuote but takes the exact Yahoo ticker (e.g. "^NSEI" for the NIFTY index). */
export async function fetchYahooQuoteExact(displaySymbol: string, ySymbol: string): Promise<RawQuote | null> {
  return withRetry(() => attemptYahooFetch(displaySymbol, ySymbol));
}

async function attemptAlphaVantageFetch(symbol: string, apiKey: string): Promise<RawQuote> {
  const avSymbol = `${symbol}.BSE`; // Alpha Vantage's free tier indexes Indian equities under BSE
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
    avSymbol
  )}&apikey=${apiKey}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_USER_AGENT },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Alpha Vantage responded ${res.status}`);

  const json = await res.json();
  const q = json?.['Global Quote'];
  if (!q || !q['05. price']) throw new Error('Alpha Vantage returned no quote for this symbol');

  const price = parseFloat(q['05. price']);
  const previousClose = parseFloat(q['08. previous close']);
  const changePercent = parseFloat((q['10. change percent'] ?? '0%').replace('%', ''));

  return {
    symbol,
    price,
    open: parseFloat(q['02. open']) || price,
    high: parseFloat(q['03. high']) || price,
    low: parseFloat(q['04. low']) || price,
    previousClose: previousClose || price,
    volume: parseInt(q['06. volume'], 10) || 0,
    changePercent: isFinite(changePercent) ? changePercent : 0,
    source: 'alpha_vantage',
    history: [], // Alpha Vantage's free GLOBAL_QUOTE has no trailing history
    // Alpha Vantage's GLOBAL_QUOTE doesn't return an intraday timestamp,
    // only a trading-day date -- not precise enough to dedup against;
    // ingest.ts falls back to fetch-time for this source.
    marketTimestamp: null,
  };
}

/** Fallback source: Alpha Vantage free tier GLOBAL_QUOTE. Requires ALPHA_VANTAGE_API_KEY. Retries with backoff. */
export async function fetchAlphaVantageQuote(symbol: string): Promise<RawQuote | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null; // no key configured is not a transient failure -- don't retry, just skip
  return withRetry(() => attemptAlphaVantageFetch(symbol, apiKey));
}

/**
 * Tries Yahoo (3 attempts with backoff), then Alpha Vantage (3 attempts with
 * backoff), then gives up on this symbol for the current cycle. Returns
 * null (never fabricated data) if both exhaust their retries.
 */
export async function fetchRealQuote(symbol: string): Promise<RawQuote | null> {
  const yahoo = await fetchYahooQuote(symbol);
  if (yahoo) return yahoo;
  const av = await fetchAlphaVantageQuote(symbol);
  if (av) return av;
  return null;
}

export interface DerivedMetrics {
  avgDailyMovePct: number;
  avg20DayVolume: number;
  ma20: number;
}

/** Computed straight from the real trailing history Yahoo returns alongside the quote. */
export function computeDerivedMetrics(history: DailyBar[]): DerivedMetrics {
  if (history.length < 2) {
    return { avgDailyMovePct: 1, avg20DayVolume: 0, ma20: 0 };
  }
  const trailing = history.slice(-21, -1); // last 20 days, excluding today
  const moves: number[] = [];
  for (let i = 1; i < trailing.length; i++) {
    const prev = trailing[i - 1].close;
    const cur = trailing[i].close;
    if (prev > 0) moves.push((Math.abs(cur - prev) / prev) * 100);
  }
  const avgDailyMovePct = moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : 1;
  const avg20DayVolume = trailing.length
    ? trailing.reduce((a, b) => a + b.volume, 0) / trailing.length
    : 0;
  const ma20 = trailing.length ? trailing.reduce((a, b) => a + b.close, 0) / trailing.length : 0;
  return { avgDailyMovePct, avg20DayVolume, ma20 };
}
