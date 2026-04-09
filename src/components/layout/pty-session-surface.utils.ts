export function shouldCreatePtySession(args: {
  isVisible: boolean;
  workspaceId: string;
  hasActiveTab: boolean;
}) {
  return args.isVisible && args.hasActiveTab && Boolean(args.workspaceId);
}
