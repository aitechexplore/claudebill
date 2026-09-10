import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { createInterface } from "node:readline";
import type { Turn } from "./types.js";

const CACHE_SCHEMA = 4;

export interface ScanOptions {
  /** Root that contains a `projects/` directory (default ~/.claude) */
  claudeDir?: string;
  /** Disable the per-file parse cache */
  noCache?: boolean;
  /** Progress callback (files done, files total) */
  onProgress?: (done: number, total: number) => void;
}

export interface ScanResult {
  turns: Turn[];
  files: number;
  bytes: number;
  cachedFiles: number;
  /** Lines that looked like assistant turns but could not be parsed */
  parseErrors: number;
  claudeDir: string;
}

export function defaultClaudeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

function cacheRoot(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "claudebill", `index-v${CACHE_SCHEMA}`);
}

interface CacheEntry {
  size: number;
  mtimeMs: number;
  turns: Turn[];
  parseErrors: number;
}

/** Enumerate every session transcript under <claudeDir>/projects/<slug>/*.jsonl */
export async function listSessionFiles(claudeDir: string): Promise<{ path: string; slug: string }[]> {
  const projectsDir = join(claudeDir, "projects");
  let slugs: string[] = [];
  try {
    slugs = await readdir(projectsDir);
  } catch {
    return [];
  }
  const out: { path: string; slug: string }[] = [];
  for (const slug of slugs) {
    let entries: string[] = [];
    try {
      entries = await readdir(join(projectsDir, slug));
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.endsWith(".jsonl")) out.push({ path: join(projectsDir, slug, name), slug });
    }
  }
  return out;
}

/** Parse one transcript file into deduplicated billed turns. */
export async function parseSessionFile(path: string, slug: string): Promise<{ turns: Turn[]; parseErrors: number }> {
  const sessionIdFromName = basename(path, ".jsonl");
  const seen = new Set<string>();
  const turns: Turn[] = [];
  let parseErrors = 0;
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    // Cheap pre-filter: only assistant lines carry usage.
    if (line.length < 40 || !line.includes('"type":"assistant"')) continue;
    let rec: any;
    try {
      rec = JSON.parse(line);
    } catch {
      parseErrors++;
      continue;
    }
    if (rec?.type !== "assistant") continue;
    const msg = rec.message;
    const usage = msg?.usage;
    if (!usage) continue;
    const model: string = msg.model || "";
    if (!model || model === "<synthetic>") continue;
    // One API response can be logged as several lines (thinking, text, tool_use
    // blocks) that all repeat the same usage; count it once.
    const key = msg.id || rec.requestId || rec.uuid;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const cc = usage.cache_creation || {};
    let w5 = Number(cc.ephemeral_5m_input_tokens ?? 0);
    const w1 = Number(cc.ephemeral_1h_input_tokens ?? 0);
    const wTotal = Number(usage.cache_creation_input_tokens ?? 0);
    if (w5 + w1 === 0 && wTotal > 0) w5 = wTotal; // older logs: no TTL breakdown
    turns.push({
      ts: rec.timestamp || "",
      sessionId: rec.sessionId || sessionIdFromName,
      projectSlug: slug,
      cwd: rec.cwd || "",
      gitBranch: normBranch(rec.gitBranch),
      model,
      input: Number(usage.input_tokens ?? 0),
      output: Number(usage.output_tokens ?? 0),
      cacheWrite5m: w5,
      cacheWrite1h: w1,
      cacheRead: Number(usage.cache_read_input_tokens ?? 0),
      thinking: Number(usage.output_tokens_details?.thinking_tokens ?? 0),
      sidechain: rec.isSidechain === true,
      version: rec.version || "",
    });
  }
  return { turns, parseErrors };
}

/** Scan every transcript, using the on-disk cache for files that have not changed. */
export async function scan(opts: ScanOptions = {}): Promise<ScanResult> {
  const claudeDir = opts.claudeDir || defaultClaudeDir();
  const files = await listSessionFiles(claudeDir);
  const root = cacheRoot();
  if (!opts.noCache) await mkdir(root, { recursive: true }).catch(() => {});
  const turns: Turn[] = [];
  let bytes = 0;
  let cachedFiles = 0;
  let parseErrors = 0;
  let done = 0;
  for (const f of files) {
    let st;
    try {
      st = await stat(f.path);
    } catch {
      continue;
    }
    bytes += st.size;
    const key = createHash("sha1").update(f.path).digest("hex");
    const cachePath = join(root, key + ".json");
    let entry: CacheEntry | undefined;
    if (!opts.noCache) {
      try {
        const raw = await readFile(cachePath, "utf8");
        const c = JSON.parse(raw) as CacheEntry;
        if (c.size === st.size && c.mtimeMs === st.mtimeMs) entry = c;
      } catch {
        /* cache miss */
      }
    }
    if (entry) {
      cachedFiles++;
    } else {
      const parsed = await parseSessionFile(f.path, f.slug);
      entry = { size: st.size, mtimeMs: st.mtimeMs, turns: parsed.turns, parseErrors: parsed.parseErrors };
      if (!opts.noCache) {
        const tmp = cachePath + ".tmp";
        try {
          await writeFile(tmp, JSON.stringify(entry));
          await rename(tmp, cachePath);
        } catch {
          /* cache is best effort */
        }
      }
    }
    turns.push(...entry.turns);
    parseErrors += entry.parseErrors;
    done++;
    opts.onProgress?.(done, files.length);
  }
  return { turns, files: files.length, bytes, cachedFiles, parseErrors, claudeDir };
}

/** Claude Code logs "HEAD" when the cwd is not a git checkout or is detached; treat it as no branch. */
function normBranch(b: unknown): string {
  const v = typeof b === "string" ? b.trim() : "";
  return v === "HEAD" ? "" : v;
}
