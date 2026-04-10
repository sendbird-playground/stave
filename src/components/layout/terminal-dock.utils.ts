export function shouldAutoCreateDockTerminalTab(args: {
  isTerminalDocked: boolean;
  wasTerminalDocked: boolean | null;
  terminalTabCount: number;
  workspacePath: string;
}) {
  return args.wasTerminalDocked !== null
    && args.isTerminalDocked
    && !args.wasTerminalDocked
    && args.terminalTabCount === 0
    && Boolean(args.workspacePath.trim());
}
