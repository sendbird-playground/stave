// ---------------------------------------------------------------------------
// Theme type definitions
// ---------------------------------------------------------------------------

/**
 * The 27 core design-token names consumed by shadcn/ui components.
 * These are the tokens that appear in the settings Design Tokens editor.
 */
export const THEME_TOKEN_NAMES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];
export type ThemeModeName = "light" | "dark";
export type ThemeTokenValues = Record<ThemeTokenName, string>;
export type ThemeOverrideValues = Partial<Record<ThemeTokenName, string>>;

/**
 * A named, self-contained theme preset.
 *
 * `baseMode` declares which appearance mode the theme is designed for -- its
 * CSS variables will be emitted under `:root` (light) or `.dark` (dark).
 *
 * `tokens` is a flat map of CSS custom-property names (without the leading
 * `--`) to values.  It may include both the 27 core design tokens and any
 * extended tokens defined in `globals.css` (editor, terminal, diff, etc.).
 *
 * This is also the JSON schema that user-installable themes follow.
 */
export interface CustomThemeDefinition {
  id: string;
  name: string;
  description: string;
  baseMode: ThemeModeName;
  version?: string;
  author?: string;
  tokens: Record<string, string>;
}
