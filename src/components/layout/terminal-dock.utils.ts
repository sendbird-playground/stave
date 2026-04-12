export function shouldAutoCreateDockTerminalTab(args: {
  isTerminalDocked: boolean;
  wasTerminalDocked: boolean | null;
  terminalTabCount: number;
  workspacePath: string;
}) {
  // Dock must be open, path must exist, zero tabs present.
  if (
    !args.isTerminalDocked ||
    args.terminalTabCount > 0 ||
    !args.workspacePath.trim()
  ) {
    return false;
  }
  // Skip the very first render (wasTerminalDocked still null).
  if (args.wasTerminalDocked === null) {
    return false;
  }
  // Create a tab when:
  //  • Dock just opened (closed → open transition), OR
  //  • Dock was already open but the workspace has no tabs
  //    (e.g. switched to a workspace that never had terminals).
  return true;
}
