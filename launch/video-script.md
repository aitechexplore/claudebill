# Voiceover script for launch/demo.mp4 (51 s)

Read at a relaxed pace. Each block is timed to what is on screen. If a block
runs long, that is fine, I will re-time the video to the audio.

| Time | On screen | Say |
|---|---|---|
| 0:00 | comment line + `npx claudebill` typing | Every Claude Code session writes a transcript to your disk, with the exact tokens the API billed. Nobody reads them. claudebill does. |
| 0:07 | summary table | One command. What today, this week, this month, and all time cost, and which model took the money. |
| 0:14 | `sessions --since 7d` | Which session burned the budget. |
| 0:19 | `projects` | Which project. On my machine, one project turned out to be ninety-six percent of everything I ever spent. |
| 0:27 | `daily` | Day by day, with a sparkline. |
| 0:33 | `cache` | And whether prompt caching is earning its keep. Mine saved about forty-five thousand dollars. |
| 0:40 | `--help` | There is more: cost per git branch, per model, a live mode, and JSON or CSV export for CI. |
| 0:47 | closing line | Retroactive. Offline. Zero dependencies. npx claudebill. |

About 120 words, roughly 48 seconds at a normal pace.

## Music
One Artlist track, no vocals, no heavy beat, ambient or soft electronic.
Download the MP3 or WAV into this folder as `launch/music.mp3`.

## Voice
Export the ElevenLabs audio as `launch/voice.mp3` (or record it on the Mac
with QuickTime and save as `launch/voice.m4a`). Then tell me; I mix voice at
full level, music at about 15 percent, and export `launch/demo-final.mp4`.

## YouTube
Title: claudebill: see what your Claude Code sessions actually cost
Description: first paragraph of README, then "npx claudebill" and the GitHub link.
Visibility: public. Tag: claude code, anthropic, cli, developer tools.
