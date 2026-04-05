import { FolderTree, GitBranch, Info, Sparkles, type LucideIcon } from "lucide-react";

export const RIGHT_RAIL_PANEL_IDS = [
  "explorer",
  "changes",
  "information",
  "scripts",
] as const;

export type RightRailPanelId = typeof RIGHT_RAIL_PANEL_IDS[number];

export const RIGHT_RAIL_PANEL_TITLES: Record<RightRailPanelId, string> = {
  explorer: "Explorer",
  changes: "Source Control",
  information: "Information",
  scripts: "Scripts",
};

export const RIGHT_RAIL_PANEL_ICONS: Record<RightRailPanelId, LucideIcon> = {
  explorer: FolderTree,
  changes: GitBranch,
  information: Info,
  scripts: Sparkles,
};
