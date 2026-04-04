export const RIGHT_RAIL_PANEL_IDS = [
  "explorer",
  "changes",
  "information",
  "automation",
] as const;

export type RightRailPanelId = typeof RIGHT_RAIL_PANEL_IDS[number];

export const RIGHT_RAIL_PANEL_TITLES: Record<RightRailPanelId, string> = {
  explorer: "Explorer",
  changes: "Changes",
  information: "Information",
  automation: "Automation",
};
