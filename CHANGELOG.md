# Changelog

## 0.1.0

First release.

- `summary`, `sessions`, `session`, `projects`, `branches`, `models`, `daily`, `cache`, `live`, `prices`, `export`
- Retroactive analysis of every transcript under `~/.claude/projects`
- Per-file parse cache; first run over ~800 MB of history in about a second, later runs instant
- Anthropic list prices for the Claude 3 through Claude 5 families, with 5-minute and 1-hour cache-write rates and cache-read rates
- `--prices` overrides for local or self-hosted models; unknown models are flagged, never priced silently
- `--plan pro|max5|max20` comparison, `--json` and `--csv` everywhere, `--dir` for headless and CI machines
- Price-table version stamped on every report
