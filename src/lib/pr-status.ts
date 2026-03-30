// ---------------------------------------------------------------------------
// PR Status – types, derivation, and visual config
// ---------------------------------------------------------------------------

/** Simplified status derived from GitHub PR fields. */
export type WorkspacePrStatus =
  | "no_pr"
  | "draft"
  | "review_required"
  | "changes_requested"
  | "checks_pending"
  | "checks_failed"
  | "merge_conflict"
  | "behind_base"
  | "ready_to_merge"
  | "merged"
  | "closed_unmerged";

/** Raw payload returned by the `scm:get-pr-status` IPC handler. */
export interface GitHubPrPayload {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  url: string;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "" | null;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus:
    | "BEHIND"
    | "BLOCKED"
    | "CLEAN"
    | "DIRTY"
    | "DRAFT"
    | "HAS_HOOKS"
    | "UNKNOWN"
    | "UNSTABLE";
  checksRollup: "SUCCESS" | "FAILURE" | "PENDING" | null;
  mergedAt: string | null;
  baseRefName: string;
  headRefName: string;
}

/** Cached PR info stored per workspace. */
export interface WorkspacePrInfo {
  /** Null means "no PR exists for this branch". */
  pr: GitHubPrPayload | null;
  /** Derived single-enum status. */
  derived: WorkspacePrStatus;
  /** Epoch-ms of last successful fetch. */
  lastFetched: number;
}

// ---------------------------------------------------------------------------
// Derivation – priority-ordered mapping from raw GitHub fields to enum
// ---------------------------------------------------------------------------

export function derivePrStatus(pr: GitHubPrPayload): WorkspacePrStatus {
  // 1. Terminal states
  if (pr.mergedAt || pr.state === "MERGED") return "merged";
  if (pr.state === "CLOSED") return "closed_unmerged";

  // 2. Draft
  if (pr.isDraft) return "draft";

  // 3. Blocking conditions (highest urgency first)
  if (pr.mergeable === "CONFLICTING") return "merge_conflict";
  if (pr.mergeStateStatus === "BEHIND") return "behind_base";
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "changes_requested";

  // 4. Checks
  if (pr.checksRollup === "FAILURE") return "checks_failed";
  if (pr.checksRollup === "PENDING") return "checks_pending";

  // 5. Review gate
  if (
    pr.reviewDecision === "REVIEW_REQUIRED" ||
    pr.reviewDecision === "" ||
    pr.reviewDecision === null
  ) {
    return "review_required";
  }

  // 6. All green
  return "ready_to_merge";
}

// ---------------------------------------------------------------------------
// Visual config – icon name, semantic color token, short label
// ---------------------------------------------------------------------------

export type PrStatusColor = "muted" | "primary" | "warning" | "destructive" | "success";

export interface PrStatusVisual {
  /** Lucide icon name (must match the React import). */
  icon: string;
  /** Semantic color token from the theme. */
  color: PrStatusColor;
  /** Human-readable short label. */
  label: string;
}

export const PR_STATUS_VISUAL: Record<WorkspacePrStatus, PrStatusVisual> = {
  no_pr:             { icon: "GitPullRequestCreateArrow", color: "muted",       label: "No PR" },
  draft:             { icon: "GitPullRequestDraft",       color: "muted",       label: "Draft" },
  review_required:   { icon: "GitPullRequest",            color: "primary",     label: "Review required" },
  changes_requested: { icon: "GitPullRequest",            color: "destructive", label: "Changes requested" },
  checks_pending:    { icon: "GitPullRequest",            color: "warning",     label: "Checks running" },
  checks_failed:     { icon: "GitPullRequest",            color: "destructive", label: "Checks failed" },
  merge_conflict:    { icon: "GitCompareArrows",          color: "destructive", label: "Merge conflict" },
  behind_base:       { icon: "GitBranch",                 color: "warning",     label: "Behind base" },
  ready_to_merge:    { icon: "GitMerge",                  color: "success",     label: "Ready to merge" },
  merged:            { icon: "GitMerge",                  color: "success",     label: "Merged" },
  closed_unmerged:   { icon: "GitPullRequestClosed",      color: "muted",       label: "Closed" },
};

/** Maps semantic color token to Tailwind text class. */
export const PR_COLOR_CLASS: Record<PrStatusColor, string> = {
  muted:       "text-muted-foreground",
  primary:     "text-primary",
  warning:     "text-warning",
  destructive: "text-destructive",
  success:     "text-success",
};

/** Maps semantic color token to Tailwind bg/border classes for badge styling. */
export const PR_COLOR_BADGE_CLASS: Record<PrStatusColor, string> = {
  muted:       "border-muted-foreground/30 bg-muted/60 text-muted-foreground",
  primary:     "border-primary/30 bg-primary/10 text-primary",
  warning:     "border-warning/30 bg-warning/10 text-warning",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  success:     "border-success/30 bg-success/10 text-success",
};

// ---------------------------------------------------------------------------
// Action config – primary + secondary actions per status
// ---------------------------------------------------------------------------

export type PrAction =
  | "create_pr"
  | "create_draft"
  | "mark_ready"
  | "merge"
  | "update_branch"
  | "open_github"
  | "refresh";

export interface PrActionConfig {
  key: PrAction;
  label: string;
  variant?: "default" | "outline" | "ghost" | "destructive";
}

export const PR_STATUS_ACTIONS: Record<WorkspacePrStatus, { primary: PrActionConfig | null; secondary: PrActionConfig[] }> = {
  no_pr: {
    primary: { key: "create_pr", label: "Create PR" },
    secondary: [{ key: "create_draft", label: "Create Draft", variant: "outline" }],
  },
  draft: {
    primary: { key: "mark_ready", label: "Mark Ready" },
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  review_required: {
    primary: null,
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  changes_requested: {
    primary: null,
    secondary: [{ key: "update_branch", label: "Update Branch", variant: "outline" }, { key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  checks_pending: {
    primary: null,
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  checks_failed: {
    primary: null,
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  merge_conflict: {
    primary: null,
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  behind_base: {
    primary: { key: "update_branch", label: "Update Branch" },
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  ready_to_merge: {
    primary: { key: "merge", label: "Merge PR" },
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  merged: {
    primary: null,
    secondary: [{ key: "open_github", label: "View on GitHub", variant: "ghost" }],
  },
  closed_unmerged: {
    primary: null,
    secondary: [{ key: "open_github", label: "View on GitHub", variant: "ghost" }],
  },
};
