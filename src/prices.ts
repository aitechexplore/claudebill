// Anthropic first-party API list prices, USD per million tokens.
// Cache writes: 1.25x input for the 5-minute TTL, 2x for the 1-hour TTL.
// Cache reads: 0.1x input, except Fable 5.1 / Mythos 5.1 at 0.025x.
// Every report is stamped with PRICES_VERSION so a later repricing never
// silently rewrites a number someone budgeted on.

export const PRICES_VERSION = "2026-09-10";

export interface ModelPrice {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
  /** USD per 1M cache-write tokens, 5-minute TTL */
  cacheWrite5m: number;
  /** USD per 1M cache-write tokens, 1-hour TTL */
  cacheWrite1h: number;
  /** USD per 1M cache-read tokens */
  cacheRead: number;
  /** Human label */
  label: string;
}

function p(label: string, input: number, output: number, cacheRead?: number): ModelPrice {
  return {
    label,
    input,
    output,
    cacheWrite5m: input * 1.25,
    cacheWrite1h: input * 2,
    cacheRead: cacheRead ?? input * 0.1,
  };
}

/** Exact model ids, plus dated snapshots, as Claude Code writes them into session logs. */
export const PRICES: Record<string, ModelPrice> = {
  "claude-fable-5-1": p("Claude Fable 5.1", 10, 50, 0.25),
  "claude-mythos-5-1": p("Claude Mythos 5.1", 10, 50, 0.25),
  "claude-fable-5": p("Claude Fable 5", 10, 50, 1.0),
  "claude-mythos-5": p("Claude Mythos 5", 10, 50, 1.0),
  "claude-opus-5": p("Claude Opus 5", 5, 25),
  "claude-opus-4-8": p("Claude Opus 4.8", 5, 25),
  "claude-opus-4-7": p("Claude Opus 4.7", 5, 25),
  "claude-opus-4-6": p("Claude Opus 4.6", 5, 25),
  "claude-opus-4-5": p("Claude Opus 4.5", 15, 75),
  "claude-opus-4-1": p("Claude Opus 4.1", 15, 75),
  "claude-opus-4-0": p("Claude Opus 4", 15, 75),
  "claude-sonnet-5": p("Claude Sonnet 5", 2, 10),
  "claude-sonnet-4-6": p("Claude Sonnet 4.6", 3, 15),
  "claude-sonnet-4-5": p("Claude Sonnet 4.5", 3, 15),
  "claude-sonnet-4-0": p("Claude Sonnet 4", 3, 15),
  "claude-3-7-sonnet": p("Claude Sonnet 3.7", 3, 15),
  "claude-3-5-sonnet": p("Claude Sonnet 3.5", 3, 15),
  "claude-haiku-4-5": p("Claude Haiku 4.5", 1, 5),
  "claude-3-5-haiku": p("Claude Haiku 3.5", 0.8, 4),
  "claude-3-haiku": p("Claude Haiku 3", 0.25, 1.25),
  "claude-3-opus": p("Claude Opus 3", 15, 75),
};

/** Models that never bill: Claude Code's synthetic placeholder rows. */
export const ZERO_COST_MODELS = new Set(["<synthetic>"]);

/**
 * Resolve a logged model id to a price entry. Handles dated snapshots
 * (claude-sonnet-4-5-20250929), provider prefixes (anthropic.claude-opus-5,
 * vertex "claude-opus-5@20260401"), and user overrides.
 */
export function resolvePrice(model: string, table: Record<string, ModelPrice> = PRICES): ModelPrice | undefined {
  if (!model) return undefined;
  if (table[model]) return table[model];
  let m = model.toLowerCase();
  m = m.replace(/^(anthropic\.|us\.anthropic\.|eu\.anthropic\.|global\.anthropic\.)/, "");
  m = m.replace(/@\d{8}$/, "");
  m = m.replace(/-v\d+(:\d+)?$/, "");
  m = m.replace(/-\d{8}$/, "");
  if (table[m]) return table[m];
  // Longest known key that prefixes the id (claude-3-5-sonnet-latest, claude-opus-4-1-...).
  let best: string | undefined;
  for (const key of Object.keys(table)) {
    if (m.startsWith(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? table[best] : undefined;
}

export interface UsageTokens {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

/** USD cost of one usage record; undefined when the model is unpriced. */
export function costOf(u: UsageTokens, price: ModelPrice | undefined): number | undefined {
  if (!price) return undefined;
  return (
    (u.input * price.input +
      u.output * price.output +
      u.cacheWrite5m * price.cacheWrite5m +
      u.cacheWrite1h * price.cacheWrite1h +
      u.cacheRead * price.cacheRead) /
    1_000_000
  );
}

/** Merge a user-supplied JSON price table ({"model-id": {input, output, cacheRead?, cacheWrite5m?, cacheWrite1h?, label?}}). */
export function mergePriceTable(base: Record<string, ModelPrice>, override: Record<string, Partial<ModelPrice>>): Record<string, ModelPrice> {
  const out: Record<string, ModelPrice> = { ...base };
  for (const [id, o] of Object.entries(override)) {
    const input = o.input ?? base[id]?.input ?? 0;
    const output = o.output ?? base[id]?.output ?? 0;
    out[id] = {
      label: o.label ?? base[id]?.label ?? id,
      input,
      output,
      cacheWrite5m: o.cacheWrite5m ?? (base[id] && o.input === undefined ? base[id].cacheWrite5m : input * 1.25),
      cacheWrite1h: o.cacheWrite1h ?? (base[id] && o.input === undefined ? base[id].cacheWrite1h : input * 2),
      cacheRead: o.cacheRead ?? (base[id] && o.input === undefined ? base[id].cacheRead : input * 0.1),
    };
  }
  return out;
}
