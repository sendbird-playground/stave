export interface GitGraphCommit {
  hash: string;
  abbrevHash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDateISO: string;
  subject: string;
  refs: string[];
}

export interface GitGraphResponse {
  ok: boolean;
  commits: GitGraphCommit[];
  hasMore: boolean;
  stderr: string;
}

export interface GitCommitDetail {
  ok: boolean;
  hash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDateISO: string;
  body: string;
  refs: string[];
  files: Array<{ status: string; path: string }>;
  stderr: string;
}

export interface GraphEdge {
  fromColumn: number;
  toColumn: number;
  color: string;
  type: "straight" | "merge-in" | "fork-out";
}

export interface GraphRowLayout {
  commit: GitGraphCommit;
  column: number;
  incomingEdges: GraphEdge[];
  outgoingEdges: GraphEdge[];
  laneCount: number;
}
