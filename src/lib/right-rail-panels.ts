import { FolderTree, GitBranch, Info, Sparkles, type LucideIcon } from "lucide-react";

export const RIGHT_RAIL_PANEL_IDS = [
  "explorer",
  "changes",
  "information",
  "automation",
] as const;

export type RightRailPanelId = typeof RIGHT_RAIL_PANEL_IDS[number];

export const RIGHT_RAIL_PANEL_TITLES: Record<RightRailPanelId, string> = {
  explorer: "Explorer",
  changes: "Source Control",
  information: "Information",
  automation: "Automation",
};

export const RIGHT_RAIL_PANEL_ICONS: Record<RightRailPanelId, LucideIcon> = {
  explorer: FolderTree,
  changes: GitBranch,
  information: Info,
  automation: Sparkles,
};
