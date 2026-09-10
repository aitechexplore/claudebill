const useColor = !process.env.NO_COLOR && process.stdout.isTTY && process.env.TERM !== "dumb";
const ESC = "\x1b";
const wrap = (code: string) => (s: string) => (useColor ? `${ESC}[${code}m${s}${ESC}[0m` : s);
export const bold = wrap("1");
export const dim = wrap("2");
export const green = wrap("32");
export const yellow = wrap("33");
export const cyan = wrap("36");
export const red = wrap("31");

export function money(usd: number | undefined, digits = 2): string {
  if (usd === undefined || Number.isNaN(usd)) return "-";
  if (usd >= 100) return `$${usd.toFixed(0)}`;
  if (usd >= 10) return `$${usd.toFixed(1)}`;
  if (usd >= 0.01 || usd === 0) return `$${usd.toFixed(digits)}`;
  return `$${usd.toFixed(4)}`;
}

export function tokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** Share of a total: rounds to whole percent, but never hides a non-zero slice as 0%. */
export function share(x: number): string {
  if (x > 0 && x < 0.005) return "<1%";
  return pct(x);
}

export function minutes(m: number): string {
  if (m < 1) return "<1m";
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return `${h}h${r ? ` ${r}m` : ""}`;
}

export function shortDate(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "?";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${mi}`;
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)) + "…";
}

/** Render rows as an aligned table. Header names starting with "!" are right-aligned. */
export function table(headers: string[], rows: string[][]): string {
  const right = headers.map((h) => h.startsWith("!"));
  const names = headers.map((h) => h.replace(/^!/, ""));
  const widths = names.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => (right[i] ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join("  ").trimEnd();
  const out = [bold(line(names)), dim(widths.map((w) => "-".repeat(w)).join("  "))];
  for (const r of rows) out.push(line(r.map((c) => c ?? "")));
  return out.join("\n");
}

const BARS = "▁▂▃▄▅▆▇█";
/** Sparkline capped at `width` columns; longer series are summed into buckets. */
export function sparkline(values: number[], width = 60): string {
  let series = values;
  if (values.length > width) {
    series = new Array(width).fill(0);
    for (let i = 0; i < values.length; i++) series[Math.floor((i * width) / values.length)] += values[i];
  }
  const max = Math.max(...series, 0);
  if (max === 0) return series.map(() => BARS[0]).join("");
  return series.map((v) => BARS[Math.min(BARS.length - 1, Math.round((v / max) * (BARS.length - 1)))]).join("");
}

export function bar(value: number, max: number, width = 20): string {
  if (max <= 0) return "";
  const n = Math.round((value / max) * width);
  return "█".repeat(n) + dim("░".repeat(width - n));
}
