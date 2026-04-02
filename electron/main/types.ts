import type * as pty from "node-pty";

export interface CommandResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export interface SourceControlStatusItem {
  code: string;
  path: string;
  indexStatus?: string;
  workingTreeStatus?: string;
}

export interface TerminalSession {
  pty: pty.IPty;
  output: string;
}

export interface RootFileEntry {
  relativePath: string;
}
