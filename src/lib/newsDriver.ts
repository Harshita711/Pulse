// Section 2 item 26: "matched to instruments by symbol/company-name within a
// time window, always 'possible driver, confidence: medium/low,' never
// 'caused'." No API key -> no headlines -> the honest "no obvious catalyst
// found" state (never fabricated). This uses NewsAPI's /v2/everything; swap
// in a finance RSS parser here if you'd rather avoid the NewsAPI key.

export interface NewsHeadline {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
}

export interface PossibleDriver {
  headline: NewsHeadline;
  confidence: 'medium' | 'low';
}

export async function fetchRecentHeadlines(companyName: string, hoursBack = 48): Promise<NewsHeadline[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) return [];
  const from = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
    companyName
  )}&from=${from}&language=en&sortBy=publishedAt&pageSize=5&apiKey=${apiKey}`;
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const json = await res.json();
    const articles = json?.articles ?? [];
    return articles.map((a: any) => ({
      title: a.title,
      source: a.source?.name ?? 'unknown',
      publishedAt: a.publishedAt,
      url: a.url,
    }));
  } catch {
    return [];
  }
}

/**
 * Confidence is deliberately capped at "medium" -- symbol/name text matching
 * within a time window is a correlation, not causal attribution. A headline
 * whose title contains the exact company name is "medium"; a looser match
 * (symbol only, or found via broader search) is "low".
 */
export function rankPossibleDrivers(companyName: string, symbol: string, headlines: NewsHeadline[]): PossibleDriver[] {
  return headlines
    .map((h) => {
      const title = h.title?.toLowerCase() ?? '';
      const exactNameMatch = title.includes(companyName.toLowerCase());
      const symbolMatch = title.includes(symbol.toLowerCase());
      const confidence: 'medium' | 'low' = exactNameMatch ? 'medium' : 'low';
      return { headline: h, confidence, matched: exactNameMatch || symbolMatch };
    })
    .filter((d) => d.matched)
    .map(({ headline, confidence }) => ({ headline, confidence }));
}

export const NO_DRIVER_LABEL = 'No obvious catalyst found';
