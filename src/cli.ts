import { readFile } from "node:fs/promises";
import { bySession, dayKey, groupBy, inWindow, parseSince, projectName, totals, turnCost, type GroupRow } from "./aggregate.js";
import { bar, bold, cyan, dim, green, minutes, money, pct, share, red, shortDate, sparkline, table, tokens, truncate, yellow } from "./format.js";
import { mergePriceTable, PRICES, PRICES_VERSION, resolvePrice, type ModelPrice } from "./prices.js";
import { scan } from "./scan.js";
import type { SessionSummary, Turn } from "./types.js";

export const VERSION = "0.1.1";

const PLANS: Record<string, { label: string; usd: number }> = {
  pro: { label: "Claude Pro ($20/mo)", usd: 20 },
  max5: { label: "Claude Max 5x ($100/mo)", usd: 100 },
  max20: { label: "Claude Max 20x ($200/mo)", usd: 200 },
};

interface Opts {
  json: boolean;
  csv: boolean;
  since?: string;
  until?: string;
  dir?: string;
  limit: number;
  sort: string;
  project?: string;
  model?: string;
  branch?: string;
  plan?: string;
  prices?: string;
  noCache: boolean;
  quiet: boolean;
  sidechain: string;
  help: boolean;
  version: boolean;
}

const HELP = `claudebill ${VERSION}: see what your Claude Code sessions actually cost.

Reads the transcripts Claude Code already keeps under ~/.claude/projects.
No install hooks, no network, no account. History is analyzed retroactively.

USAGE
  claudebill [command] [options]

COMMANDS
  summary            Totals for today, this week, this month, all time (default)
  sessions           Sessions ranked by cost
  session <id>       One session, turn by turn
  projects           Cost per project directory
  branches           Cost per git branch (cost per unit of work)
  models             Cost per model, with cache economics
  daily              Day-by-day spend with a sparkline
  cache              Cache hit rate and what the cache saved you
  live               Follow the newest session and print running cost
  prices             The price table this build uses
  export             Every turn as JSON or CSV

OPTIONS
  --since <when>     24h, 7d, 2w, 1mo, today, month, or an ISO date
  --until <when>     Upper bound, same formats
  --project <text>   Only sessions whose project path contains <text>
  --branch <text>    Only turns on a git branch containing <text>
  --model <text>     Only turns whose model id contains <text>
  --sidechain <mode> include (default), only, or exclude subagent turns
  --limit <n>        Rows to show (default 20)
  --sort <key>       cost (default), tokens, time, cache
  --plan <name>      Compare API-equivalent cost with pro, max5, or max20
  --prices <file>    JSON price overrides, e.g. local or self-hosted models
  --dir <path>       Claude config dir (default ~/.claude or $CLAUDE_CONFIG_DIR)
  --json             Machine-readable output
  --csv              CSV output (export, sessions, daily, projects, branches, models)
  --no-cache         Re-parse every transcript
  --quiet            No progress on stderr
  -h, --help         This help
  -v, --version      Version

EXAMPLES
  claudebill                              # what did Claude Code cost me?
  claudebill sessions --since 7d          # which sessions burned the budget this week
  claudebill branches --since month       # cost per branch this month
  claudebill cache                        # is prompt caching earning its keep?
  claudebill summary --plan max20         # API-equivalent spend vs the Max plan
  claudebill live                         # watch a session's cost tick up
  claudebill export --csv > turns.csv     # everything, for your own analysis
  CLAUDE_CONFIG_DIR=/ci/home/.claude claudebill sessions --json   # headless / CI

Prices are Anthropic list prices (version ${PRICES_VERSION}); every report says so.
Subscription plans bill differently: the numbers are what the same tokens would cost
on the API, which is exactly the comparison --plan makes.`;

export function parseArgs(argv: string[]): { cmd: string; args: string[]; opts: Opts } {
  const opts: Opts = { json: false, csv: false, limit: 20, sort: "cost", noCache: false, quiet: false, sidechain: "include", help: false, version: false };
  const args: string[] = [];
  const take = (i: number, name: string): string => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`${name} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--csv") opts.csv = true;
    else if (a === "--no-cache") opts.noCache = true;
    else if (a === "--quiet" || a === "-q") opts.quiet = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--version" || a === "-v") opts.version = true;
    else if (a === "--since") opts.since = take(i++, a);
    else if (a === "--until") opts.until = take(i++, a);
    else if (a === "--dir") opts.dir = take(i++, a);
    else if (a === "--limit") opts.limit = Number(take(i++, a));
    else if (a === "--sort") opts.sort = take(i++, a);
    else if (a === "--project") opts.project = take(i++, a);
    else if (a === "--branch") opts.branch = take(i++, a);
    else if (a === "--model") opts.model = take(i++, a);
    else if (a === "--plan") opts.plan = take(i++, a);
    else if (a === "--prices") opts.prices = take(i++, a);
    else if (a === "--sidechain") opts.sidechain = take(i++, a);
    else if (a.startsWith("--") && a.includes("=")) {
      const [k, v] = a.slice(2).split("=", 2);
      (opts as any)[k === "no-cache" ? "noCache" : k] = k === "limit" ? Number(v) : v;
    } else if (a.startsWith("-")) throw new Error(`unknown option ${a} (see --help)`);
    else args.push(a);
  }
  if (!Number.isFinite(opts.limit) || opts.limit < 0) throw new Error("--limit must be a non-negative number");
  const cmd = args.shift() || "summary";
  return { cmd, args, opts };
}

async function loadPrices(opts: Opts): Promise<Record<string, ModelPrice>> {
  if (!opts.prices) return PRICES;
  const raw = JSON.parse(await readFile(opts.prices, "utf8"));
  return mergePriceTable(PRICES, raw);
}

function applyFilters(turns: Turn[], opts: Opts): Turn[] {
  let out = turns;
  const now = new Date();
  const since = opts.since ? parseSince(opts.since, now) : undefined;
  const until = opts.until ? parseSince(opts.until, now) : undefined;
  out = inWindow(out, since, until);
  if (opts.project) {
    const q = opts.project.toLowerCase();
    out = out.filter((t) => (t.cwd || t.projectSlug).toLowerCase().includes(q) || projectName(t.projectSlug, t.cwd).toLowerCase().includes(q));
  }
  if (opts.branch) {
    const q = opts.branch.toLowerCase();
    out = out.filter((t) => t.gitBranch.toLowerCase().includes(q));
  }
  if (opts.model) {
    const q = opts.model.toLowerCase();
    out = out.filter((t) => t.model.toLowerCase().includes(q));
  }
  if (opts.sidechain === "only") out = out.filter((t) => t.sidechain);
  else if (opts.sidechain === "exclude") out = out.filter((t) => !t.sidechain);
  return out;
}

function csvLine(cells: (string | number)[]): string {
  return cells.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

function stamp(extra: Record<string, unknown> = {}) {
  return { prices_version: PRICES_VERSION, generated_at: new Date().toISOString(), currency: "USD", basis: "Anthropic API list price", ...extra };
}

function unpricedNote(models: string[]): string {
  if (models.length === 0) return "";
  return yellow(`\nUnpriced models (tokens counted, cost excluded): ${models.join(", ")}. Add rates with --prices <file>.`);
}

export async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    console.error(red(`error: ${(e as Error).message}`));
    return 2;
  }
  const { cmd, args, opts } = parsed;
  if (opts.version) {
    console.log(VERSION);
    return 0;
  }
  if (opts.help || cmd === "help") {
    console.log(HELP);
    return 0;
  }
  const commands: Record<string, (turns: Turn[], table: Record<string, ModelPrice>, args: string[], opts: Opts) => Promise<number> | number> = {
    summary: cmdSummary,
    sessions: cmdSessions,
    session: cmdSession,
    projects: (t, tb, a, o) => cmdGroup("project", t, tb, o),
    branches: (t, tb, a, o) => cmdGroup("branch", t, tb, o),
    models: (t, tb, a, o) => cmdGroup("model", t, tb, o),
    daily: cmdDaily,
    cache: cmdCache,
    export: cmdExport,
    live: cmdLive,
  };
  if (cmd === "prices") return cmdPrices(await loadPrices(opts), opts);
  if (!commands[cmd]) {
    console.error(red(`error: unknown command "${cmd}"`) + `\n\n${HELP}`);
    return 2;
  }
  let table: Record<string, ModelPrice>;
  try {
    table = await loadPrices(opts);
  } catch (e) {
    console.error(red(`error: --prices: ${(e as Error).message}`));
    return 2;
  }
  const t0 = Date.now();
  const progress = !opts.quiet && !opts.json && !opts.csv && process.stderr.isTTY;
  const result = await scan({
    claudeDir: opts.dir,
    noCache: opts.noCache,
    onProgress: progress ? (d, n) => { if (n > 40 && d % 25 === 0) process.stderr.write(`\rscanning ${d}/${n} transcripts…`); } : undefined,
  });
  if (progress) process.stderr.write("\r\x1b[2K");
  if (result.files === 0) {
    console.error(yellow(`No Claude Code transcripts found under ${result.claudeDir}/projects.`) + "\nRun a Claude Code session first, or point --dir at the machine's Claude config directory.");
    return 3;
  }
  let turns: Turn[];
  try {
    turns = applyFilters(result.turns, opts);
  } catch (e) {
    console.error(red(`error: ${(e as Error).message}`));
    return 2;
  }
  if (!opts.quiet && !opts.json && !opts.csv) {
    const ms = Date.now() - t0;
    const mb = (result.bytes / 1_048_576).toFixed(0);
    console.error(dim(`${result.files} transcripts, ${mb} MB, ${result.turns.length} billed turns, ${ms} ms${result.cachedFiles ? ` (${result.cachedFiles} from cache)` : ""}`));
  }
  return commands[cmd](turns, table, args, opts);
}

function cmdSummary(turns: Turn[], tb: Record<string, ModelPrice>, _args: string[], opts: Opts): number {
  const now = new Date();
  const windows: [string, Date | undefined][] = [
    ["Today", parseSince("today", now)],
    ["Last 7 days", parseSince("7d", now)],
    ["Last 30 days", parseSince("30d", now)],
    ["This month", parseSince("month", now)],
    ["All time", undefined],
  ];
  const rows = windows.map(([label, since]) => ({ label, ...totals(inWindow(turns, since), tb) }));
  const models = groupBy(turns, tb, (t) => t.model).sort((a, b) => b.cost - a.cost);
  const all = rows[rows.length - 1];
  const plan = opts.plan ? PLANS[opts.plan] : undefined;
  const monthCost = rows[3].cost;
  if (opts.plan && !plan) {
    console.error(red(`error: unknown --plan ${opts.plan}; use pro, max5, or max20`));
    return 2;
  }
  if (opts.json) {
    console.log(JSON.stringify(stamp({
      windows: rows.map((r) => ({ window: r.label, cost_usd: round(r.cost), sessions: r.sessions, turns: r.turns, input: r.input, output: r.output, cache_write: r.cacheWrite, cache_read: r.cacheRead, thinking: r.thinking, total_tokens: r.totalTokens, cache_hit_rate: round(r.cacheHitRate, 4), unpriced_tokens: r.unpricedTokens })),
      models: models.map(modelRowJson),
      unpriced_models: all.unpricedModels,
      plan: plan ? { name: opts.plan, monthly_usd: plan.usd, month_api_equivalent_usd: round(monthCost), multiple: round(monthCost / plan.usd, 2) } : undefined,
    }), null, 2));
    return 0;
  }
  console.log(bold(`Claude Code spend (API-equivalent, prices ${PRICES_VERSION})`));
  console.log(table(["Window", "!Cost", "!Sessions", "!Turns", "!Tokens", "!Cache hit"], rows.map((r) => [r.label, money(r.cost), String(r.sessions), String(r.turns), tokens(r.totalTokens), pct(r.cacheHitRate)])));
  if (models.length) {
    console.log("\n" + bold("By model, all time"));
    const max = Math.max(...models.map((m) => m.cost));
    console.log(table(["Model", "!Cost", "!Share", "!Turns", "!Cache hit", ""], models.map((m) => [m.key, money(m.cost), all.cost ? share(m.cost / all.cost) : "-", String(m.turns), pct(m.cacheHitRate), bar(m.cost, max, 16)])));
  }
  if (plan) {
    const mult = plan.usd ? monthCost / plan.usd : 0;
    console.log("\n" + bold(`This month vs ${plan.label}`));
    console.log(`  API-equivalent spend so far: ${cyan(money(monthCost))}  (${mult.toFixed(1)}x the plan price)`);
    console.log(dim("  Subscription plans meter usage in 5-hour windows, not dollars; this is what the same tokens would have cost on the API."));
  }
  const cacheSaved = cacheSavings(turns, tb);
  if (cacheSaved > 0) console.log("\n" + `Prompt caching saved you about ${green(money(cacheSaved))} all time. ` + dim("Run `claudebill cache` for the breakdown."));
  console.log(unpricedNote(all.unpricedModels));
  console.log(dim(`\nTop: claudebill sessions --since 7d   |   Per branch: claudebill branches   |   Live: claudebill live`));
  return 0;
}

function modelRowJson(m: GroupRow) {
  return { model: m.key, cost_usd: round(m.cost), turns: m.turns, sessions: m.sessions, input: m.input, output: m.output, cache_write: m.cacheWrite, cache_read: m.cacheRead, total_tokens: m.totalTokens, cache_hit_rate: round(m.cacheHitRate, 4), unpriced_tokens: m.unpricedTokens };
}

function round(n: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Net saving from caching: read savings minus the 1.25x/2x premium paid on cache writes. */
function cacheSavings(turns: Turn[], tb: Record<string, ModelPrice>): number {
  let saved = 0;
  for (const t of turns) {
    const p = resolvePrice(t.model, tb);
    if (!p) continue;
    saved += (t.cacheRead * (p.input - p.cacheRead)) / 1_000_000;
    saved -= (t.cacheWrite5m * (p.cacheWrite5m - p.input) + t.cacheWrite1h * (p.cacheWrite1h - p.input)) / 1_000_000;
  }
  return saved;
}

function sortSessions(s: SessionSummary[], key: string): SessionSummary[] {
  const k = key.toLowerCase();
  const cmp: Record<string, (a: SessionSummary, b: SessionSummary) => number> = {
    cost: (a, b) => b.cost - a.cost,
    tokens: (a, b) => b.totalTokens - a.totalTokens,
    time: (a, b) => b.lastTs.localeCompare(a.lastTs),
    cache: (a, b) => a.cacheHitRate - b.cacheHitRate,
  };
  return [...s].sort(cmp[k] || cmp.cost);
}

function sessionJson(s: SessionSummary) {
  return { session_id: s.sessionId, project: s.project, cwd: s.cwd, branches: s.branches, models: s.models, started_at: s.firstTs, ended_at: s.lastTs, duration_min: round(s.durationMin, 1), turns: s.turns, subagent_turns: s.sidechainTurns, input: s.input, output: s.output, cache_write: s.cacheWrite, cache_read: s.cacheRead, thinking: s.thinking, total_tokens: s.totalTokens, cost_usd: round(s.cost), cache_hit_rate: round(s.cacheHitRate, 4), unpriced_tokens: s.unpricedTokens };
}

function cmdSessions(turns: Turn[], tb: Record<string, ModelPrice>, _args: string[], opts: Opts): number {
  const sessions = sortSessions(bySession(turns, tb), opts.sort);
  const shown = opts.limit ? sessions.slice(0, opts.limit) : sessions;
  if (opts.json) {
    console.log(JSON.stringify(stamp({ count: sessions.length, shown: shown.length, sessions: shown.map(sessionJson) }), null, 2));
    return 0;
  }
  if (opts.csv) {
    console.log(csvLine(["session_id", "project", "branches", "models", "started_at", "ended_at", "duration_min", "turns", "subagent_turns", "input", "output", "cache_write", "cache_read", "total_tokens", "cost_usd", "cache_hit_rate"]));
    for (const s of shown) console.log(csvLine([s.sessionId, s.project, s.branches.join("|"), s.models.join("|"), s.firstTs, s.lastTs, round(s.durationMin, 1), s.turns, s.sidechainTurns, s.input, s.output, s.cacheWrite, s.cacheRead, s.totalTokens, round(s.cost), round(s.cacheHitRate, 4)]));
    return 0;
  }
  const all = totals(turns, tb);
  console.log(bold(`${sessions.length} sessions, ${money(all.cost)} API-equivalent`) + dim(` (showing ${shown.length}, sorted by ${opts.sort})`));
  console.log(table(["Session", "Project", "Branch", "Started", "!Dur", "!Turns", "!Tokens", "!Cache", "!Cost"], shown.map((s) => [s.sessionId.slice(0, 8), truncate(s.project, 26), truncate(s.branches[0] || "-", 18), shortDate(s.firstTs), minutes(s.durationMin), String(s.turns), tokens(s.totalTokens), pct(s.cacheHitRate), money(s.cost)])));
  console.log(dim("\nDetail: claudebill session <id>"));
  console.log(unpricedNote(all.unpricedModels));
  return 0;
}

function cmdSession(turns: Turn[], tb: Record<string, ModelPrice>, args: string[], opts: Opts): number {
  const id = args[0];
  if (!id) {
    console.error(red("error: session <id> needs a session id (or its first characters); list them with `claudebill sessions`"));
    return 2;
  }
  const matches = [...new Set(turns.filter((t) => t.sessionId.startsWith(id)).map((t) => t.sessionId))];
  if (matches.length === 0) {
    console.error(red(`error: no session starts with ${JSON.stringify(id)}`));
    return 3;
  }
  if (matches.length > 1) {
    console.error(red(`error: ${matches.length} sessions start with ${JSON.stringify(id)}: ${matches.map((m) => m.slice(0, 12)).join(", ")}`));
    return 2;
  }
  const mine = turns.filter((t) => t.sessionId === matches[0]).sort((a, b) => a.ts.localeCompare(b.ts));
  const s = bySession(mine, tb)[0];
  const perTurn = mine.map((t) => ({ ts: t.ts, model: t.model, input: t.input, output: t.output, cache_write: t.cacheWrite5m + t.cacheWrite1h, cache_read: t.cacheRead, thinking: t.thinking, subagent: t.sidechain, branch: t.gitBranch, cost_usd: turnCost(t, tb) === undefined ? null : round(turnCost(t, tb)!) }));
  if (opts.json) {
    console.log(JSON.stringify(stamp({ session: sessionJson(s), turns: perTurn }), null, 2));
    return 0;
  }
  console.log(bold(`Session ${s.sessionId}`));
  console.log(`  Project   ${s.project}${s.cwd ? dim(`  (${s.cwd})`) : ""}`);
  console.log(`  Branches  ${s.branches.join(", ") || "-"}`);
  console.log(`  Models    ${s.models.join(", ")}`);
  console.log(`  When      ${shortDate(s.firstTs)} → ${shortDate(s.lastTs)}  (${minutes(s.durationMin)})`);
  console.log(`  Turns     ${s.turns}${s.sidechainTurns ? ` (${s.sidechainTurns} by subagents)` : ""}`);
  console.log(`  Tokens    in ${tokens(s.input)}  out ${tokens(s.output)}  cache write ${tokens(s.cacheWrite)}  cache read ${tokens(s.cacheRead)}  thinking ${tokens(s.thinking)}`);
  console.log(`  Cache hit ${pct(s.cacheHitRate)}`);
  console.log(`  Cost      ${cyan(money(s.cost))} API-equivalent`);
  const byModel = groupBy(mine, tb, (t) => t.model).sort((a, b) => b.cost - a.cost);
  if (byModel.length > 1) console.log("\n" + table(["Model", "!Turns", "!Tokens", "!Cache hit", "!Cost"], byModel.map((m) => [m.key, String(m.turns), tokens(m.totalTokens), pct(m.cacheHitRate), money(m.cost)])));
  const costs = perTurn.map((t) => t.cost_usd ?? 0);
  console.log("\n" + bold("Cost per turn") + "  " + sparkline(costs) + (costs.length > 60 ? dim(`  (${costs.length} turns, bucketed)`) : ""));
  const top = [...perTurn].map((t, i) => ({ ...t, i })).sort((a, b) => (b.cost_usd ?? 0) - (a.cost_usd ?? 0)).slice(0, Math.min(8, opts.limit || 8));
  console.log(table(["#", "Time", "Model", "!In", "!Out", "!Cache w", "!Cache r", "!Cost"], top.map((t) => [String(t.i + 1), shortDate(t.ts).slice(11), t.model.replace("claude-", ""), tokens(t.input), tokens(t.output), tokens(t.cache_write), tokens(t.cache_read), money(t.cost_usd ?? undefined)])));
  console.log(dim("Most expensive turns; `--json` lists every turn."));
  console.log(unpricedNote(totals(mine, tb).unpricedModels));
  return 0;
}

function cmdGroup(kind: "project" | "branch" | "model", turns: Turn[], tb: Record<string, ModelPrice>, opts: Opts): number {
  const keyFn = kind === "project" ? (t: Turn) => projectName(t.projectSlug, t.cwd) : kind === "branch" ? (t: Turn) => t.gitBranch || "(no branch)" : (t: Turn) => t.model;
  let rows = groupBy(turns, tb, keyFn);
  const k = opts.sort.toLowerCase();
  rows.sort(k === "tokens" ? (a, b) => b.totalTokens - a.totalTokens : k === "cache" ? (a, b) => a.cacheHitRate - b.cacheHitRate : (a, b) => b.cost - a.cost);
  const shown = opts.limit ? rows.slice(0, opts.limit) : rows;
  const all = totals(turns, tb);
  const label = kind === "project" ? "Project" : kind === "branch" ? "Branch" : "Model";
  if (opts.json) {
    console.log(JSON.stringify(stamp({ group: kind, total_cost_usd: round(all.cost), rows: shown.map((m) => ({ [kind]: m.key, ...modelRowJson(m), model: undefined })) }), null, 2));
    return 0;
  }
  if (opts.csv) {
    console.log(csvLine([kind, "cost_usd", "share", "sessions", "turns", "input", "output", "cache_write", "cache_read", "total_tokens", "cache_hit_rate"]));
    for (const m of shown) console.log(csvLine([m.key, round(m.cost), all.cost ? round(m.cost / all.cost, 4) : 0, m.sessions, m.turns, m.input, m.output, m.cacheWrite, m.cacheRead, m.totalTokens, round(m.cacheHitRate, 4)]));
    return 0;
  }
  const max = Math.max(...shown.map((m) => m.cost), 0);
  const plural = kind === "branch" ? "branches" : `${kind}s`;
  console.log(bold(`Cost by ${kind}`) + dim(`  (${rows.length} ${plural}, ${money(all.cost)} total)`));
  const extra = kind === "model" ? ["!In $/M", "!Out $/M", "!Read $/M"] : [];
  console.log(table([label, "!Cost", "!Share", "!Sessions", "!Turns", "!Tokens", "!Cache hit", ...extra, ""], shown.map((m) => {
    const p = kind === "model" ? resolvePrice(m.key, tb) : undefined;
    const ex = kind === "model" ? [p ? `$${p.input}` : "?", p ? `$${p.output}` : "?", p ? `$${p.cacheRead}` : "?"] : [];
    return [truncate(m.key, 34), money(m.cost), all.cost ? share(m.cost / all.cost) : "-", String(m.sessions), String(m.turns), tokens(m.totalTokens), pct(m.cacheHitRate), ...ex, bar(m.cost, max, 16)];
  })));
  if (kind === "branch") console.log(dim("\nA branch is the closest thing to a unit of work in the logs; pair with `git log` to get cost per merged PR."));
  console.log(unpricedNote(all.unpricedModels));
  return 0;
}

function cmdDaily(turns: Turn[], tb: Record<string, ModelPrice>, _args: string[], opts: Opts): number {
  const since = opts.since ? undefined : parseSince("30d");
  const scoped = since ? inWindow(turns, since) : turns;
  const rows = groupBy(scoped, tb, (t) => dayKey(t.ts)).filter((r) => r.key !== "unknown").sort((a, b) => a.key.localeCompare(b.key));
  if (opts.json) {
    console.log(JSON.stringify(stamp({ days: rows.map((r) => ({ date: r.key, cost_usd: round(r.cost), sessions: r.sessions, turns: r.turns, total_tokens: r.totalTokens, cache_hit_rate: round(r.cacheHitRate, 4) })) }), null, 2));
    return 0;
  }
  if (opts.csv) {
    console.log(csvLine(["date", "cost_usd", "sessions", "turns", "input", "output", "cache_write", "cache_read", "total_tokens", "cache_hit_rate"]));
    for (const r of rows) console.log(csvLine([r.key, round(r.cost), r.sessions, r.turns, r.input, r.output, r.cacheWrite, r.cacheRead, r.totalTokens, round(r.cacheHitRate, 4)]));
    return 0;
  }
  if (rows.length === 0) {
    console.log("No billed turns in this window.");
    return 0;
  }
  const total = rows.reduce((a, r) => a + r.cost, 0);
  const max = Math.max(...rows.map((r) => r.cost));
  console.log(bold(`Daily spend${since ? " (last 30 days)" : ""}`) + dim(`  ${money(total)} over ${rows.length} active days, ${money(total / rows.length)} per active day`));
  console.log(sparkline(rows.map((r) => r.cost)) + "  " + dim(`${rows[0].key} → ${rows[rows.length - 1].key}`));
  const shown = opts.limit ? rows.slice(-opts.limit) : rows;
  console.log(table(["Date", "!Cost", "!Sessions", "!Turns", "!Tokens", "!Cache hit", ""], shown.map((r) => [r.key, money(r.cost), String(r.sessions), String(r.turns), tokens(r.totalTokens), pct(r.cacheHitRate), bar(r.cost, max, 16)])));
  return 0;
}

function cmdCache(turns: Turn[], tb: Record<string, ModelPrice>, _args: string[], opts: Opts): number {
  const all = totals(turns, tb);
  const saved = cacheSavings(turns, tb);
  let writeCost = 0;
  let write5m = 0;
  let write1h = 0;
  let readCost = 0;
  let inputCost = 0;
  let outputCost = 0;
  for (const t of turns) {
    const p = resolvePrice(t.model, tb);
    if (!p) continue;
    write5m += t.cacheWrite5m;
    write1h += t.cacheWrite1h;
    writeCost += (t.cacheWrite5m * p.cacheWrite5m + t.cacheWrite1h * p.cacheWrite1h) / 1e6;
    readCost += (t.cacheRead * p.cacheRead) / 1e6;
    inputCost += (t.input * p.input) / 1e6;
    outputCost += (t.output * p.output) / 1e6;
  }
  const uncachedEquivalent = all.cost + saved;
  const perSession = bySession(turns, tb).filter((s) => s.turns >= 5).sort((a, b) => a.cacheHitRate - b.cacheHitRate).slice(0, opts.limit || 10);
  if (opts.json) {
    console.log(JSON.stringify(stamp({ cache_hit_rate: round(all.cacheHitRate, 4), cache_read_tokens: all.cacheRead, cache_write_tokens: all.cacheWrite, cache_write_5m_tokens: write5m, cache_write_1h_tokens: write1h, cost_breakdown_usd: { input: round(inputCost), output: round(outputCost), cache_write: round(writeCost), cache_read: round(readCost), total: round(all.cost) }, saved_by_caching_usd: round(saved), uncached_equivalent_usd: round(uncachedEquivalent), worst_sessions: perSession.map(sessionJson) }), null, 2));
    return 0;
  }
  console.log(bold("Prompt cache economics"));
  console.log(`  Cache hit rate      ${cyan(pct(all.cacheHitRate))}  ${dim("(cache reads ÷ all input-side tokens)")}`);
  console.log(`  Tokens read         ${tokens(all.cacheRead)}   written ${tokens(all.cacheWrite)} ${dim(`(5m ${tokens(write5m)}, 1h ${tokens(write1h)})`)}   fresh input ${tokens(all.input)}   output ${tokens(all.output)}`);
  console.log(`  Spend               input ${money(inputCost)}  output ${money(outputCost)}  cache writes ${money(writeCost)}  cache reads ${money(readCost)}  = ${money(all.cost)}`);
  console.log(`  Caching saved you   ${green(money(saved))}  ${dim(`(without caching the same tokens would be about ${money(uncachedEquivalent)})`)}`);
  if (perSession.length) {
    console.log("\n" + bold("Sessions with the worst cache hit rate") + dim(" (5+ turns)"));
    console.log(table(["Session", "Project", "Started", "!Turns", "!Cache hit", "!Cost"], perSession.map((s) => [s.sessionId.slice(0, 8), truncate(s.project, 26), shortDate(s.firstTs), String(s.turns), pct(s.cacheHitRate), money(s.cost)])));
    console.log(dim("Low hit rates usually mean long gaps between turns (the 5-minute cache expired) or a changing system prompt."));
  }
  return 0;
}


function cmdExport(turns: Turn[], tb: Record<string, ModelPrice>, _args: string[], opts: Opts): number {
  const sorted = [...turns].sort((a, b) => a.ts.localeCompare(b.ts));
  if (opts.csv || !opts.json) {
    console.log(csvLine(["timestamp", "session_id", "project", "cwd", "git_branch", "model", "input", "output", "cache_write_5m", "cache_write_1h", "cache_read", "thinking", "subagent", "claude_code_version", "cost_usd", "prices_version"]));
    for (const t of sorted) console.log(csvLine([t.ts, t.sessionId, projectName(t.projectSlug, t.cwd), t.cwd, t.gitBranch, t.model, t.input, t.output, t.cacheWrite5m, t.cacheWrite1h, t.cacheRead, t.thinking, t.sidechain ? 1 : 0, t.version, turnCost(t, tb) === undefined ? "" : round(turnCost(t, tb)!, 6), PRICES_VERSION]));
    return 0;
  }
  console.log(JSON.stringify(stamp({ count: sorted.length, turns: sorted.map((t) => ({ timestamp: t.ts, session_id: t.sessionId, project: projectName(t.projectSlug, t.cwd), cwd: t.cwd, git_branch: t.gitBranch, model: t.model, input: t.input, output: t.output, cache_write_5m: t.cacheWrite5m, cache_write_1h: t.cacheWrite1h, cache_read: t.cacheRead, thinking: t.thinking, subagent: t.sidechain, claude_code_version: t.version, cost_usd: turnCost(t, tb) === undefined ? null : round(turnCost(t, tb)!, 6) })) }), null, 2));
  return 0;
}

function cmdPrices(tb: Record<string, ModelPrice>, opts: Opts): number {
  const rows = Object.entries(tb).sort((a, b) => b[1].input - a[1].input || a[0].localeCompare(b[0]));
  if (opts.json) {
    console.log(JSON.stringify(stamp({ prices: Object.fromEntries(rows.map(([k, v]) => [k, v])) }), null, 2));
    return 0;
  }
  console.log(bold(`Price table ${PRICES_VERSION}`) + dim("  USD per million tokens; cache write 5m = 1.25x input, 1h = 2x input"));
  console.log(table(["Model id", "Label", "!Input", "!Output", "!Cache w 5m", "!Cache w 1h", "!Cache read"], rows.map(([k, v]) => [k, v.label, `$${v.input}`, `$${v.output}`, `$${v.cacheWrite5m}`, `$${v.cacheWrite1h}`, `$${v.cacheRead}`])));
  console.log(dim(`\nOverride or add models with --prices file.json, e.g. {"my-local-llama": {"input": 0, "output": 0, "label": "Local Llama"}}`));
  return 0;
}

async function cmdLive(turns: Turn[], tb: Record<string, ModelPrice>, _args: string[], opts: Opts): Promise<number> {
  const { listSessionFiles, parseSessionFile, defaultClaudeDir } = await import("./scan.js");
  const { stat } = await import("node:fs/promises");
  const dir = opts.dir || defaultClaudeDir();
  const pick = async () => {
    const files = await listSessionFiles(dir);
    let best: { path: string; slug: string; mtime: number } | undefined;
    for (const f of files) {
      try {
        const st = await stat(f.path);
        if (!best || st.mtimeMs > best.mtime) best = { ...f, mtime: st.mtimeMs };
      } catch { /* skip */ }
    }
    return best;
  };
  let target = await pick();
  if (!target) {
    console.error(red("no transcripts found"));
    return 3;
  }
  console.error(dim(`following ${target.path}\nCtrl-C to stop`));
  let lastSize = -1;
  let lastLine = "";
  for (;;) {
    const fresh = await pick();
    if (fresh && fresh.path !== target.path) {
      target = fresh;
      lastSize = -1;
      console.error(dim(`\nswitched to ${target.path}`));
    }
    let size = 0;
    try {
      size = (await stat(target.path)).size;
    } catch { /* file rotated */ }
    if (size !== lastSize) {
      lastSize = size;
      const parsed = await parseSessionFile(target.path, target.slug);
      const s = bySession(parsed.turns, tb)[0];
      if (s) {
        const line = `${shortDate(s.lastTs)}  ${s.sessionId.slice(0, 8)}  ${truncate(s.project, 24)}  turns ${s.turns}  tokens ${tokens(s.totalTokens)}  cache ${pct(s.cacheHitRate)}  cost ${cyan(money(s.cost))}`;
        if (line !== lastLine) {
          if (opts.json) console.log(JSON.stringify({ ...sessionJson(s), prices_version: PRICES_VERSION }));
          else process.stdout.write(`\r\x1b[2K${line}`);
          lastLine = line;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
