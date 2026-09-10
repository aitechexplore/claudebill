import { costOf, resolvePrice, ZERO_COST_MODELS, type ModelPrice } from "./prices.js";
import type { SessionSummary, Turn } from "./types.js";

export interface Totals {
  turns: number;
  sessions: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  thinking: number;
  totalTokens: number;
  cost: number;
  unpricedTokens: number;
  unpricedModels: string[];
  cacheHitRate: number;
}

export function turnCost(t: Turn, table: Record<string, ModelPrice>): number | undefined {
  if (ZERO_COST_MODELS.has(t.model)) return 0;
  return costOf(t, resolvePrice(t.model, table));
}

export function projectName(slug: string, cwd: string): string {
  if (cwd) {
    const parts = cwd.split("/").filter(Boolean);
    return parts[parts.length - 1] || cwd;
  }
  const parts = slug.split("-").filter(Boolean);
  return parts.slice(-2).join("-") || slug;
}

/** Cache hit rate = cache reads / all input-side tokens. */
export function hitRate(input: number, cacheWrite: number, cacheRead: number): number {
  const denom = input + cacheWrite + cacheRead;
  return denom === 0 ? 0 : cacheRead / denom;
}

export function totals(turns: Turn[], table: Record<string, ModelPrice>): Totals {
  const t: Totals = { turns: 0, sessions: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, thinking: 0, totalTokens: 0, cost: 0, unpricedTokens: 0, unpricedModels: [], cacheHitRate: 0 };
  const sessions = new Set<string>();
  const unpriced = new Set<string>();
  for (const x of turns) {
    t.turns++;
    sessions.add(x.sessionId);
    t.input += x.input;
    t.output += x.output;
    t.cacheWrite += x.cacheWrite5m + x.cacheWrite1h;
    t.cacheRead += x.cacheRead;
    t.thinking += x.thinking;
    const c = turnCost(x, table);
    if (c === undefined) {
      unpriced.add(x.model);
      t.unpricedTokens += x.input + x.output + x.cacheWrite5m + x.cacheWrite1h + x.cacheRead;
    } else {
      t.cost += c;
    }
  }
  t.sessions = sessions.size;
  t.totalTokens = t.input + t.output + t.cacheWrite + t.cacheRead;
  t.unpricedModels = [...unpriced].sort();
  t.cacheHitRate = hitRate(t.input, t.cacheWrite, t.cacheRead);
  return t;
}

export function bySession(turns: Turn[], table: Record<string, ModelPrice>): SessionSummary[] {
  const map = new Map<string, Turn[]>();
  for (const t of turns) {
    const arr = map.get(t.sessionId);
    if (arr) arr.push(t);
    else map.set(t.sessionId, [t]);
  }
  const out: SessionSummary[] = [];
  for (const [sessionId, arr] of map) {
    arr.sort((a, b) => a.ts.localeCompare(b.ts));
    const tt = totals(arr, table);
    const first = arr[0];
    const last = arr[arr.length - 1];
    const cwd = arr.find((x) => x.cwd)?.cwd || "";
    const branches = [...new Set(arr.map((x) => x.gitBranch).filter(Boolean))];
    const models = [...new Set(arr.map((x) => x.model))];
    const durationMin = first.ts && last.ts ? Math.max(0, (Date.parse(last.ts) - Date.parse(first.ts)) / 60000) : 0;
    out.push({
      sessionId,
      projectSlug: first.projectSlug,
      project: projectName(first.projectSlug, cwd),
      cwd,
      branches,
      models,
      firstTs: first.ts,
      lastTs: last.ts,
      turns: tt.turns,
      sidechainTurns: arr.filter((x) => x.sidechain).length,
      input: tt.input,
      output: tt.output,
      cacheWrite: tt.cacheWrite,
      cacheRead: tt.cacheRead,
      thinking: tt.thinking,
      totalTokens: tt.totalTokens,
      cost: tt.cost,
      unpricedTokens: tt.unpricedTokens,
      cacheHitRate: tt.cacheHitRate,
      durationMin,
    });
  }
  return out;
}

export interface GroupRow {
  key: string;
  turns: number;
  sessions: number;
  totalTokens: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  cost: number;
  cacheHitRate: number;
  unpricedTokens: number;
}

export function groupBy(turns: Turn[], table: Record<string, ModelPrice>, keyFn: (t: Turn) => string): GroupRow[] {
  const map = new Map<string, Turn[]>();
  for (const t of turns) {
    const k = keyFn(t);
    const arr = map.get(k);
    if (arr) arr.push(t);
    else map.set(k, [t]);
  }
  const rows: GroupRow[] = [];
  for (const [key, arr] of map) {
    const tt = totals(arr, table);
    rows.push({ key, turns: tt.turns, sessions: tt.sessions, totalTokens: tt.totalTokens, input: tt.input, output: tt.output, cacheWrite: tt.cacheWrite, cacheRead: tt.cacheRead, cost: tt.cost, cacheHitRate: tt.cacheHitRate, unpricedTokens: tt.unpricedTokens });
  }
  return rows;
}

/** Local-date key (YYYY-MM-DD) for a turn. */
export function dayKey(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse "7d", "24h", "2w", "1mo", "today", "month", or an ISO date into a lower bound. */
export function parseSince(s: string, now = new Date()): Date {
  const m = /^(\d+)\s*(m|h|d|w|mo)$/i.exec(s.trim());
  if (m) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const ms = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : unit === "d" ? 86_400_000 : unit === "w" ? 604_800_000 : 30 * 86_400_000;
    return new Date(now.getTime() - n * ms);
  }
  if (/^today$/i.test(s)) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (/^month$/i.test(s)) return new Date(now.getFullYear(), now.getMonth(), 1);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`cannot parse --since ${JSON.stringify(s)}; use 24h, 7d, 2w, 1mo, today, month, or an ISO date`);
  return d;
}

export function inWindow(turns: Turn[], since?: Date, until?: Date): Turn[] {
  if (!since && !until) return turns;
  const lo = since ? since.getTime() : -Infinity;
  const hi = until ? until.getTime() : Infinity;
  return turns.filter((t) => {
    const x = Date.parse(t.ts);
    return !Number.isNaN(x) && x >= lo && x <= hi;
  });
}
