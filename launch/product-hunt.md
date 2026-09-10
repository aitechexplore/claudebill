# Product Hunt launch kit: claudecost

## Name
claudecost

## Tagline (60 chars max)
See what your Claude Code sessions actually cost

## Description (260 chars max)
Claude Code already logs every token it bills. claudecost reads those logs and shows cost per session, project, git branch, model, and day, plus what prompt caching saved you. Retroactive, offline, zero dependencies. npx claudecost.

## Topics
Developer Tools, Artificial Intelligence, Open Source, Productivity

## First comment (maker)
Hi Product Hunt, Hassan here.

Every Claude Code session writes a transcript to ~/.claude with the exact token counts the API billed, split into fresh input, output, cache writes, and cache reads. Nobody reads them. I wanted to know which of my sessions burned the budget, whether prompt caching was actually earning its keep, and what my Max plan would have cost on the API.

So claudecost reads those transcripts. That is the whole trick:

- It is retroactive. It works on the history you already have, back to your first session. No hooks, nothing to install before you start.
- It never touches the network. Local files in, text out.
- It answers the questions that matter: cost per session, per project, per git branch (the closest thing to cost per PR), per model, per day, and a cache report that shows the sessions where caching fell apart.
- It works headless. Point it at a CI runner's Claude config dir and use --json or --csv.
- Every report is stamped with the price-table version, so a future price change can never quietly rewrite last month's number.

npx claudecost

It's MIT-licensed and a single dependency-free Node package. I'd love to hear which number you check first.

## Gallery / screenshot commands
1. `claudecost` (the summary table)
2. `claudecost sessions --since 7d`
3. `claudecost cache`
4. `claudecost branches --since month`
5. `claudecost live` (animated GIF)

## Launch checklist
- [ ] `npm login`, then `npm publish` from the repo (already `prepublishOnly`-tested)
- [ ] Make the GitHub repo public; add topics claude-code, anthropic, cost, cli
- [x] Screenshots 1-4 rendered from real output in `launch/screenshots/` (summary, sessions, cache, branches, models). Still to do: the `claudecost live` GIF, and re-shoot any screenshot you want with your own data.
- [ ] Post at 00:01 PT (Product Hunt's daily reset) on a Tuesday or Wednesday
- [ ] Reply to every comment in the first 4 hours; questions people asked the last tool in this space: overhead (none), retroactive (yes), CI (yes, --dir), mixed local models (--prices), agent-to-agent (--sidechain), repricing (prices_version)
