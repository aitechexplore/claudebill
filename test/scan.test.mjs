import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseSessionFile, listSessionFiles, scan } from "../dist/scan.js";
import { bySession, totals, groupBy, dayKey, parseSince, inWindow, projectName, hitRate } from "../dist/aggregate.js";
import { PRICES } from "../dist/prices.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const file = join(fixtures, "projects", "-Users-me-proj", "aaaa-1111.jsonl");

test("parseSessionFile dedupes by message id, skips synthetic, keeps unknown models", async () => {
  const { turns, parseErrors } = await parseSessionFile(file, "-Users-me-proj");
  assert.equal(parseErrors, 1);
  assert.equal(turns.length, 3);
  const [a, b, c] = turns;
  assert.equal(a.model, "claude-opus-5");
  assert.equal(a.cacheWrite5m, 600);
  assert.equal(a.cacheWrite1h, 400);
  assert.equal(a.cacheRead, 5000);
  assert.equal(a.thinking, 50);
  assert.equal(a.gitBranch, "main");
  assert.equal(b.sidechain, true);
  assert.equal(b.cacheWrite5m, 300, "older logs without TTL breakdown count as 5m writes");
  assert.equal(c.model, "my-local-llama");
});

test("scan finds fixture transcripts and the cache round-trips", async () => {
  process.env.XDG_CACHE_HOME = join(fixtures, ".cache-" + process.pid);
  const files = await listSessionFiles(fixtures);
  assert.equal(files.length, 1);
  const first = await scan({ claudeDir: fixtures });
  assert.equal(first.turns.length, 3);
  assert.equal(first.cachedFiles, 0);
  const second = await scan({ claudeDir: fixtures });
  assert.equal(second.turns.length, 3);
  assert.equal(second.cachedFiles, 1);
  const nocache = await scan({ claudeDir: fixtures, noCache: true });
  assert.equal(nocache.cachedFiles, 0);
  const empty = await scan({ claudeDir: join(fixtures, "does-not-exist") });
  assert.equal(empty.files, 0);
});

test("totals and bySession price what they can and flag the rest", async () => {
  const { turns } = await parseSessionFile(file, "-Users-me-proj");
  const t = totals(turns, PRICES);
  assert.equal(t.turns, 3);
  assert.equal(t.sessions, 1);
  assert.deepEqual(t.unpricedModels, ["my-local-llama"]);
  assert.equal(t.unpricedTokens, 2000);
  const opus = (100 * 5 + 200 * 25 + 600 * 6.25 + 400 * 10 + 5000 * 0.5) / 1e6;
  const sonnet = (10 * 3 + 20 * 15 + 300 * 3.75) / 1e6;
  assert.ok(Math.abs(t.cost - (opus + sonnet)) < 1e-9);
  const s = bySession(turns, PRICES)[0];
  assert.equal(s.project, "proj");
  assert.deepEqual(s.branches, ["main", "feature/x"]);
  assert.equal(s.sidechainTurns, 1);
  assert.ok(s.durationMin > 2.9 && s.durationMin < 3.1);
  const byBranch = groupBy(turns, PRICES, (x) => x.gitBranch || "(no branch)");
  assert.equal(byBranch.length, 3);
});

test("window parsing and helpers", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  assert.equal(parseSince("7d", now).toISOString(), "2026-09-03T12:00:00.000Z");
  assert.equal(parseSince("24h", now).toISOString(), "2026-09-09T12:00:00.000Z");
  assert.equal(parseSince("2w", now).toISOString(), "2026-08-27T12:00:00.000Z");
  assert.equal(parseSince("2026-08-01", now).toISOString(), "2026-08-01T00:00:00.000Z");
  assert.throws(() => parseSince("nonsense", now));
  assert.equal(dayKey("not a date"), "unknown");
  assert.match(dayKey("2026-09-01T10:00:00.000Z"), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(projectName("-Users-me-proj", "/Users/me/proj"), "proj");
  assert.equal(projectName("-Users-me-proj", ""), "me-proj");
  assert.equal(hitRate(0, 0, 0), 0);
  assert.equal(hitRate(100, 100, 800), 0.8);
  const turns = [{ ts: "2026-09-01T00:00:00Z" }, { ts: "2026-09-05T00:00:00Z" }, { ts: "bad" }];
  assert.equal(inWindow(turns, new Date("2026-09-02T00:00:00Z")).length, 1);
  assert.equal(inWindow(turns).length, 3);
});
