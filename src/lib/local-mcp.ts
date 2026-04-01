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

export interface StaveLocalMcpRequestLog {
  id: string;
  httpMethod: string;
  path: string;
  rpcMethod: string | null;
  rpcRequestId: string | null;
  toolName: string | null;
  statusCode: number;
  durationMs: number;
  hasRequestPayload: boolean;
  requestPayload: unknown | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface StaveLocalMcpRequestLogQuery {
  limit?: number;
  offset?: number;
  includePayload?: boolean;
}

export interface StaveLocalMcpRequestLogPage {
  logs: StaveLocalMcpRequestLog[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
