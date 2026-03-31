// ---------------------------------------------------------------------------
// Built-in custom themes that ship with Stave
// ---------------------------------------------------------------------------

import type { CustomThemeDefinition } from "./types";

/**
 * "Dark High Contrast" -- inspired by VS Code / Zed dark high-contrast
 * palettes.  Pure-black backgrounds, pure-white text, and vivid saturated
 * accent colours drawn from the nqmn1ck/vscode-dark-high-contrast reference.
 */
const DARK_HIGH_CONTRAST: CustomThemeDefinition = {
  id: "dark-high-contrast",
  name: "Dark High Contrast",
  description:
    "Pure black background with maximum-contrast white text and vivid accent colours.",
  baseMode: "dark",
  version: "1.0.0",
  author: "Stave",
  tokens: {
    // -- core 27 tokens --------------------------------------------------
    "background": "#000000",
    "foreground": "#FFFFFF",
    "card": "#000000",
    "card-foreground": "#FFFFFF",
    "popover": "#0D0D0D",
    "popover-foreground": "#FFFFFF",
    "primary": "#6FC3DF",
    "primary-foreground": "#000000",
    "secondary": "#1A1A1A",
    "secondary-foreground": "#FFFFFF",
    "muted": "#1A1A1A",
    "muted-foreground": "#B0B0B0",
    "accent": "#F38518",
    "accent-foreground": "#000000",
    "destructive": "#FF5555",
    "border": "#6FC3DF",
    "input": "#6FC3DF",
    "ring": "#6FC3DF",
    "sidebar": "#000000",
    "sidebar-foreground": "#FFFFFF",
    "sidebar-primary": "#6FC3DF",
    "sidebar-primary-foreground": "#000000",
    "sidebar-accent": "#1A1A1A",
    "sidebar-accent-foreground": "#FFFFFF",
    "sidebar-border": "#6FC3DF",
    "sidebar-ring": "#6FC3DF",

    // -- extended tokens --------------------------------------------------
    "destructive-foreground": "#FFFFFF",
    "success": "#50FA7B",
    "success-foreground": "#000000",
    "warning": "#DEC184",
    "warning-foreground": "#000000",
    "overlay": "oklch(0 0 0 / 0.88)",
    "surface": "#0A0A0A",
    "editor": "#000000",
    "editor-foreground": "#FFFFFF",
    "editor-muted": "#1A1A1A",
    "editor-tab": "#000000",
    "editor-tab-active": "#1A1A1A",
    "terminal": "#000000",
    "terminal-foreground": "#FFFFFF",
    "diff-added": "#0D3B1A",
    "diff-added-foreground": "#50FA7B",
    "diff-removed": "#3B0D0D",
    "diff-removed-foreground": "#FF5555",
    "chart-1": "#6FC3DF",
    "chart-2": "#F38518",
    "chart-3": "#50FA7B",
    "chart-4": "#FF5555",
    "chart-5": "#BD93F9",
    "provider-codex": "#8BE9FD",
    "provider-claude": "#F38518",
  },
};

/**
 * All themes bundled with Stave out of the box.
 * Add new entries here -- they'll appear automatically in the settings UI.
 */
export const BUILTIN_CUSTOM_THEMES: CustomThemeDefinition[] = [
  DARK_HIGH_CONTRAST,
];
