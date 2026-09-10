import test from "node:test";
import assert from "node:assert/strict";
import { PRICES, resolvePrice, costOf, mergePriceTable, PRICES_VERSION } from "../dist/prices.js";

test("price table is stamped and has the current models", () => {
  assert.match(PRICES_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  for (const id of ["claude-opus-5", "claude-sonnet-5", "claude-fable-5-1", "claude-haiku-4-5"]) assert.ok(PRICES[id], id);
  assert.equal(PRICES["claude-opus-5"].cacheWrite5m, 6.25);
  assert.equal(PRICES["claude-opus-5"].cacheWrite1h, 10);
  assert.equal(PRICES["claude-opus-5"].cacheRead, 0.5);
  assert.equal(PRICES["claude-fable-5-1"].cacheRead, 0.25);
});

test("resolvePrice handles snapshots, provider prefixes, and unknown ids", () => {
  assert.equal(resolvePrice("claude-sonnet-4-5-20250929")?.label, "Claude Sonnet 4.5");
  assert.equal(resolvePrice("anthropic.claude-opus-5")?.label, "Claude Opus 5");
  assert.equal(resolvePrice("us.anthropic.claude-opus-4-8-v1:0")?.label, "Claude Opus 4.8");
  assert.equal(resolvePrice("claude-opus-5@20260401")?.label, "Claude Opus 5");
  assert.equal(resolvePrice("claude-3-5-sonnet-latest")?.label, "Claude Sonnet 3.5");
  assert.equal(resolvePrice("my-local-llama"), undefined);
  assert.equal(resolvePrice(""), undefined);
});

test("costOf applies the five token classes", () => {
  const p = PRICES["claude-opus-5"];
  const usd = costOf({ input: 1_000_000, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 }, p);
  assert.equal(usd, 5);
  const mixed = costOf({ input: 100, output: 200, cacheWrite5m: 600, cacheWrite1h: 400, cacheRead: 5000 }, p);
  const expected = (100 * 5 + 200 * 25 + 600 * 6.25 + 400 * 10 + 5000 * 0.5) / 1e6;
  assert.ok(Math.abs(mixed - expected) < 1e-12);
  assert.equal(costOf({ input: 1, output: 1, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 }, undefined), undefined);
});

test("mergePriceTable adds and overrides", () => {
  const t = mergePriceTable(PRICES, { "my-local": { input: 0, output: 0, label: "Local" }, "claude-opus-5": { cacheRead: 0.4 } });
  assert.equal(t["my-local"].cacheWrite5m, 0);
  assert.equal(t["my-local"].label, "Local");
  assert.equal(t["claude-opus-5"].cacheRead, 0.4);
  assert.equal(t["claude-opus-5"].input, 5);
  assert.equal(t["claude-sonnet-5"].input, 2);
});
