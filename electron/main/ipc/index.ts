import { registerFilesystemHandlers } from "./filesystem";
import { registerInlineCompletionHandlers } from "./inline-completion";
import { registerLocalMcpHandlers } from "./local-mcp";
import { registerEslintHandlers } from "./eslint";
import { registerLspHandlers } from "./lsp";
import { registerMetricsHandlers } from "./metrics";
import { registerPersistenceHandlers } from "./persistence";
import { registerProviderHandlers } from "./provider";
import { registerScmHandlers } from "./scm";
import { registerScreenshotHandlers } from "./screenshot";
import { registerSkillsHandlers } from "./skills";
import { registerTerminalHandlers } from "./terminal";
import { registerToolingHandlers } from "./tooling";
import { registerWindowHandlers } from "./window";

export function registerHandlers() {
  registerWindowHandlers();
  registerProviderHandlers();
  registerPersistenceHandlers();
  registerTerminalHandlers();
  registerToolingHandlers();
  registerScmHandlers();
  registerFilesystemHandlers();
  registerSkillsHandlers();
  registerLspHandlers();
  registerEslintHandlers();
  registerScreenshotHandlers();
  registerInlineCompletionHandlers();
  registerMetricsHandlers();
  registerLocalMcpHandlers();
}
