/** One billed assistant turn (one API response), deduplicated by message id. */
export interface Turn {
  /** ISO timestamp of the assistant message */
  ts: string;
  sessionId: string;
  /** Project directory slug under ~/.claude/projects */
  projectSlug: string;
  /** Working directory recorded by Claude Code, when present */
  cwd: string;
  gitBranch: string;
  model: string;
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  /** Thinking tokens, when the log breaks them out */
  thinking: number;
  /** True for subagent (sidechain) turns */
  sidechain: boolean;
  /** Claude Code version that wrote the line */
  version: string;
}

export interface SessionSummary {
  sessionId: string;
  projectSlug: string;
  project: string;
  cwd: string;
  branches: string[];
  models: string[];
  firstTs: string;
  lastTs: string;
  turns: number;
  sidechainTurns: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  thinking: number;
  totalTokens: number;
  /** API-equivalent cost in USD; undefined only when every turn is unpriced */
  cost: number;
  unpricedTokens: number;
  cacheHitRate: number;
  durationMin: number;
}
