import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseArgs } from "../dist/cli.js";
import { money, tokens, sparkline, table, pct, minutes } from "../dist/format.js";

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, "..", "dist", "index.js");
const fixtures = join(here, "fixtures");
const run = (args, opts = {}) => execFileSync(process.execPath, [bin, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1", XDG_CACHE_HOME: join(fixtures, ".cache-cli-" + process.pid) }, ...opts });

test("parseArgs", () => {
  const p = parseArgs(["sessions", "--since", "7d", "--limit", "5", "--json", "--sort=tokens"]);
  assert.equal(p.cmd, "sessions");
  assert.equal(p.opts.since, "7d");
  assert.equal(p.opts.limit, 5);
  assert.equal(p.opts.json, true);
  assert.equal(p.opts.sort, "tokens");
  assert.equal(parseArgs([]).cmd, "summary");
  assert.throws(() => parseArgs(["--since"]));
  assert.throws(() => parseArgs(["--bogus"]));
});

test("formatting helpers", () => {
  assert.equal(money(0), "$0.00");
  assert.equal(money(0.001234), "$0.0012");
  assert.equal(money(12.34), "$12.3");
  assert.equal(money(1234.5), "$1235");
  assert.equal(money(undefined), "-");
  assert.equal(tokens(999), "999");
  assert.equal(tokens(1500), "1.5k");
  assert.equal(tokens(25000), "25k");
  assert.equal(tokens(2_500_000), "2.5M");
  assert.equal(pct(0.987), "99%");
  assert.equal(minutes(0.4), "<1m");
  assert.equal(minutes(125), "2h 5m");
  assert.equal(sparkline([0, 1, 2]).length, 3);
  assert.equal(sparkline([0, 0]), "▁▁");
  assert.equal(sparkline(new Array(300).fill(1)).length, 60);
  assert.match(table(["A", "!B"], [["x", "1"]]), /A\s+B/);
});

test("end to end on the fixture directory", () => {
  const summary = JSON.parse(run(["summary", "--json", "--dir", fixtures]));
  assert.equal(summary.windows.length, 5);
  assert.equal(summary.windows[4].turns, 3);
  assert.deepEqual(summary.unpriced_models, ["my-local-llama"]);
  const sessions = JSON.parse(run(["sessions", "--json", "--dir", fixtures]));
  assert.equal(sessions.count, 1);
  assert.equal(sessions.sessions[0].subagent_turns, 1);
  const one = JSON.parse(run(["session", "aaaa", "--json", "--dir", fixtures]));
  assert.equal(one.turns.length, 3);
  assert.equal(one.turns[2].cost_usd, null);
  const csv = run(["export", "--csv", "--dir", fixtures]);
  assert.equal(csv.trim().split("\n").length, 4);
  assert.match(csv.split("\n")[0], /^timestamp,session_id/);
  const branches = JSON.parse(run(["branches", "--json", "--dir", fixtures]));
  assert.equal(branches.rows.length, 3);
  const cache = JSON.parse(run(["cache", "--json", "--dir", fixtures]));
  assert.equal(cache.cache_read_tokens, 5000);
  const prices = JSON.parse(run(["prices", "--json"]));
  assert.ok(prices.prices["claude-opus-5"]);
  const excluded = JSON.parse(run(["sessions", "--json", "--dir", fixtures, "--sidechain", "exclude"]));
  assert.equal(excluded.sessions[0].turns, 2);
  const help = run(["--help"]);
  assert.match(help, /USAGE/);
});

test("exit codes on bad input", () => {
  for (const [args, code] of [[["bogus", "--dir", fixtures], 2], [["session", "zzz", "--dir", fixtures], 3], [["sessions", "--since", "nope", "--dir", fixtures], 2], [["summary", "--dir", join(fixtures, "nothing-here")], 3]]) {
    let status = 0;
    try {
      run(args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      status = e.status;
    }
    assert.equal(status, code, args.join(" "));
  }
});
