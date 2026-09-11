# Social posts

## X / Twitter (launch)
Your Claude Code transcripts already contain every token the API billed you. Nobody reads them.

claudebill does: cost per session, project, git branch, model, day, and what prompt caching saved you. Retroactive, offline, zero deps.

npx claudebill

## X / Twitter (thread hook)
I ran it on my own machine: 68 sessions, 7 billion tokens, 98% cache hit rate, $7.5k API-equivalent. One session was $400. Here is what I learned about where Claude Code spends money. 🧵

## LinkedIn
If your team uses Claude Code on a plan, you know the seat price. You probably can't say which sessions or which branches consumed the budget, or whether prompt caching is working. claudebill reads the transcripts Claude Code already keeps and answers exactly that, offline, in one command: npx claudebill

## Hacker News (Show HN title)
Show HN: claudebill, cost per session/branch/model from your local Claude Code transcripts

## Hacker News (Show HN body, post at 8-9am ET on launch day)
Claude Code writes a JSONL transcript of every session to ~/.claude/projects, and each assistant turn carries the API usage block: fresh input, output, cache writes (5-minute and 1-hour), cache reads. claudebill reads those files and prices them with Anthropic's list prices, so you get cost per session, project, git branch, model, and day, plus a cache report.

A few things I learned building it: one response can be logged as several lines, so you have to dedupe by message id or you double count; cache writes are 1.25x or 2x input depending on TTL; and on my own machine one project was 97% of all-time spend, which I had no idea about.

It is retroactive (works on history you already have), makes no network calls, and has zero dependencies. MIT. npx claudebill

Repo: https://github.com/aitechexplore/claudebill

## Reddit r/ClaudeAI and r/ClaudeCode (title)
I built a CLI that tells you what each Claude Code session actually cost, from the transcripts already on your disk

## Reddit (body)
Every Claude Code session leaves a transcript in ~/.claude with the exact token counts the API billed. claudebill reads them and prints cost per session, project, branch, model, and day, plus how much prompt caching saved you.

Works on your existing history, never touches the network, no dependencies.

npx claudebill

Happy to answer questions about how the pricing and dedupe work. Source: https://github.com/aitechexplore/claudebill

## Posting order on launch day (Tue Sep 15)
1. 00:01 PT: post goes live automatically. Check the first comment appeared.
2. Morning: LinkedIn post, X post, both linking the Product Hunt page.
3. 8-9am ET: Show HN, linking the GitHub repo (not Product Hunt).
4. Late morning: Reddit r/ClaudeAI, then r/ClaudeCode a few hours later.
5. All day: reply to every comment everywhere within an hour.
