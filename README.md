# claudebill

**See what your Claude Code sessions actually cost.**

<a href="https://www.producthunt.com/products/claudebill?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-claudebill" target="_blank" rel="noopener noreferrer"><img alt="claudebill - See what your Claude Code sessions actually cost | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1247139&amp;theme=light&amp;t=1789106916494"></a>

![claudebill demo](https://raw.githubusercontent.com/aitechexplore/claudebill/main/launch/demo.gif)

[Watch the 60-second demo on YouTube](https://youtu.be/b-uCoQ-pcTY)

Claude Code already writes a transcript of every session to your disk, with the exact token counts the API billed. `claudebill` reads those files and tells you where the money went: by session, by project, by git branch, by model, by day, and how much prompt caching saved you.

- **Retroactive.** Analyzes the history you already have, back to your first session. Nothing to install first, nothing to hook.
- **Offline and private.** Reads local files, never makes a network request, sends nothing anywhere.
- **Zero dependencies.** One Node package, no native modules, no telemetry.
- **Works headless.** Point it at any machine's Claude config directory (CI runners included) and use `--json` or `--csv`.
- **Honest pricing.** Every report is stamped with the price-table version it used, so a future repricing can never quietly rewrite last month's number.

```
$ claudebill
Claude Code spend (API-equivalent, prices 2026-09-10)
Window         Cost  Sessions  Turns  Tokens  Cache hit
------------  -----  --------  -----  ------  ---------
Today         $9.78         1     22   18.8M        99%
Last 7 days   $56.7         3    148   72.0M        99%
Last 30 days  $1731        49   4084   1.80B        97%
This month    $56.7         3    148   72.0M        99%
All time      $7592        68  15798   7.01B        98%

By model, all time
Model              Cost  Share  Turns  Cache hit
----------------  -----  -----  -----  ---------  ----------------
claude-fable-5    $4617    61%   7612        98%  ████████████████
claude-opus-5     $2264    30%   6892        98%  ████████░░░░░░░░
claude-opus-4-8    $649     9%    993        92%  ██░░░░░░░░░░░░░░
```

## Install

```bash
npx claudebill            # run without installing
npm install -g claudebill # or install globally
```

Requires Node 18 or newer. macOS, Linux, and Windows.

## Commands

| Command | What you get |
|---|---|
| `claudebill` | Totals for today, this week, this month, and all time, plus a per-model breakdown |
| `claudebill sessions --since 7d` | Sessions ranked by cost: which one burned the budget |
| `claudebill session <id>` | One session turn by turn, with the most expensive turns called out |
| `claudebill projects` | Cost per project directory |
| `claudebill branches --since month` | Cost per git branch, the closest thing to cost per unit of work |
| `claudebill models` | Cost per model with the rates applied |
| `claudebill daily` | Day-by-day spend with a sparkline |
| `claudebill cache` | Cache hit rate, what caching saved, and the sessions where it fell apart |
| `claudebill live` | Follow the newest session and watch its cost tick up |
| `claudebill prices` | The price table this build uses |
| `claudebill export --csv` | Every billed turn, for your own spreadsheet or warehouse |

Filters work on every command: `--since 24h|7d|2w|1mo|today|month|<date>`, `--until`, `--project <text>`, `--branch <text>`, `--model <text>`, `--sidechain include|only|exclude` (subagent turns), `--limit`, `--sort cost|tokens|time|cache`.

## Answers to the questions people actually ask

**"Can it analyze my old sessions?"** Yes. That is the whole point. It reads `~/.claude/projects/**/*.jsonl`, which Claude Code has been writing since your first session.

**"Does it slow Claude Code down?"** No. It never runs during a session. It reads the transcript afterwards (or, with `claudebill live`, polls the file every two seconds).

**"I'm on a Max plan. Why does it show dollars?"** Subscriptions meter usage in five-hour windows, not dollars. `claudebill` shows what the same tokens would cost on the API, which is exactly the number you need to decide whether a plan pays off:

```bash
claudebill summary --plan max20   # this month's API-equivalent spend vs $200
```

**"What about CI or headless runs?"** Claude Code writes the same transcripts there. Point at that machine's config directory:

```bash
CLAUDE_CONFIG_DIR=/home/ci/.claude claudebill sessions --json
claudebill sessions --dir /mnt/runner-home/.claude --csv
```

**"We route some work through a local or self-hosted model."** Unknown model ids are counted in tokens and listed as unpriced, never silently priced at zero. Give them a rate (or a zero rate) with a JSON file:

```bash
echo '{"my-local-llama": {"input": 0, "output": 0, "label": "Local Llama"}}' > prices.json
claudebill --prices prices.json
```

**"Is the cache earning its keep?"** `claudebill cache` splits cache writes (5-minute and 1-hour TTL) from cache reads, shows the hit rate, and lists the sessions with the worst hit rates so you can see what broke it (usually a long pause between turns).

**"Will last month's number change when prices change?"** Not silently. Every report and every exported row carries `prices_version`. When the table is updated the version changes, and you can pin any historical rate with `--prices`.

**"Subagents?"** Subagent (sidechain) turns are included by default and counted separately per session. Use `--sidechain only` or `--sidechain exclude`.

## How it works

Each assistant message in a transcript carries the API's `usage` block: fresh input tokens, output tokens, cache writes (with the 5-minute and 1-hour split), and cache reads. `claudebill` streams every transcript once, deduplicates the lines that repeat the same API response (one response can be logged as several content blocks), prices each turn with Anthropic's list prices for that model, and caches the parsed result per file. The first run over a few gigabytes of history takes a couple of seconds; later runs re-read only files that changed.

Prices are USD per million tokens. Cache writes cost 1.25x input for the 5-minute TTL and 2x for the 1-hour TTL; cache reads cost 0.1x input (0.025x on Claude Fable 5.1). Dated snapshots and provider-prefixed ids (Bedrock, Vertex) resolve to the same rates. See `claudebill prices`.

## Exit codes

`0` ok, `2` usage error, `3` nothing found (no transcripts, unknown session).

## Privacy

`claudebill` reads files, prints text, and writes a small parse cache under `~/.cache/claudebill`. It never opens a network connection. Your transcripts are yours.

## Teams edition

claudebill is free for individuals and stays that way. If your team wants a shared dashboard with per-engineer spend, budgets, and Slack alerts, add a thumbs-up to [the Teams waitlist issue](https://github.com/aitechexplore/claudebill/issues/1).

## License

MIT. Copyright (c) 2026 [AI Tech Explore LLC](https://aitechexplore.com).

Built by [AI Tech Explore LLC](https://aitechexplore.com). Source: [github.com/aitechexplore/claudebill](https://github.com/aitechexplore/claudebill).
