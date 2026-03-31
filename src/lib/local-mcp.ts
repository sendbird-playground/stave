export interface StaveLocalMcpConfig {
  enabled: boolean;
  port: number;
  token: string;
}

export interface StaveLocalMcpManifest {
  version: 1;
  name: "stave-local-mcp";
  mode: "local-only";
  url: string;
  healthUrl: string;
  token: string;
  host: string;
  port: number;
  pid: number;
  appVersion: string;
  startedAt: string;
}

export interface StaveLocalMcpStatus {
  config: StaveLocalMcpConfig;
  running: boolean;
  manifest: StaveLocalMcpManifest | null;
  manifestPaths: string[];
  configPath: string;
}
