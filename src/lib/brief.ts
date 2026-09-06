export interface BriefFacts {
  topMover: { symbol: string; changePercent: number } | null;
  plansReachedCount: number;
  thesisFlagsCount: number;
  quietCount: number;
}

export function templatedBrief(facts: BriefFacts): string {
  const parts: string[] = [];

  if (facts.topMover) {
    const sign = facts.topMover.changePercent >= 0 ? '+' : '';
    parts.push(
      `Biggest mover: ${facts.topMover.symbol} ${sign}${facts.topMover.changePercent.toFixed(1)}%.`
    );
  }

  if (facts.plansReachedCount > 0) {
    parts.push(
      `${facts.plansReachedCount} plan${
        facts.plansReachedCount === 1 ? '' : 's'
      } reached target.`
    );
  }

  if (facts.thesisFlagsCount > 0) {
    parts.push(
      `${facts.thesisFlagsCount} thesis flag${
        facts.thesisFlagsCount === 1 ? '' : 's'
      } to review.`
    );
  }

  parts.push(
    `${facts.quietCount} stock${facts.quietCount === 1 ? '' : 's'} were quiet.`
  );

  return parts.join(' ');
}

export interface BriefResult {
  text: string;
  wasFallback: boolean;
}

const TIMEOUT_MS = 3000;
const DEFAULT_MODEL = process.env.OPENAI_BRIEF_MODEL || 'gpt-5-mini';

export async function generateBrief(
  facts: BriefFacts
): Promise<BriefResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      text: templatedBrief(facts),
      wasFallback: true,
    };
  }

  const prompt = [
    'Summarize these already-computed portfolio-attention facts in 2-3 plain sentences.',
    'Do not invent any fact not given below.',
    'Do not assign causes not stated.',
    'Do not use BUY or SELL language.',
    '',
    JSON.stringify(facts, null, 2),
  ].join('\n');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: prompt,
        max_output_tokens: 200,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return {
        text: templatedBrief(facts),
        wasFallback: true,
      };
    }

    const json = await res.json();

    const text = json?.output
      ?.flatMap((item: any) => item.content ?? [])
      ?.find((item: any) => item.type === 'output_text')
      ?.text
      ?.trim();

    if (!text) {
      return {
        text: templatedBrief(facts),
        wasFallback: true,
      };
    }

    return {
      text,
      wasFallback: false,
    };
  } catch {
    return {
      text: templatedBrief(facts),
      wasFallback: true,
    };
  }
}