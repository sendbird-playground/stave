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

export const PRESET_THEME_TOKENS: Record<ThemeModeName, ThemeTokenValues> = {
  light: {
    background: "oklch(1 0 0)",
    foreground: "oklch(0.145 0 0)",
    card: "oklch(1 0 0)",
    "card-foreground": "oklch(0.145 0 0)",
    popover: "oklch(1 0 0)",
    "popover-foreground": "oklch(0.145 0 0)",
    primary: "oklch(0.205 0 0)",
    "primary-foreground": "oklch(0.985 0 0)",
    secondary: "oklch(0.97 0 0)",
    "secondary-foreground": "oklch(0.205 0 0)",
    muted: "oklch(0.97 0 0)",
    "muted-foreground": "oklch(0.556 0 0)",
    accent: "oklch(0.205 0 0)",
    "accent-foreground": "oklch(0.985 0 0)",
    destructive: "oklch(0.58 0.22 27)",
    border: "oklch(0.922 0 0)",
    input: "oklch(0.922 0 0)",
    ring: "oklch(0.708 0 0)",
    sidebar: "oklch(0.985 0 0)",
    "sidebar-foreground": "oklch(0.145 0 0)",
    "sidebar-primary": "oklch(0.205 0 0)",
    "sidebar-primary-foreground": "oklch(0.985 0 0)",
    "sidebar-accent": "oklch(0.97 0 0)",
    "sidebar-accent-foreground": "oklch(0.205 0 0)",
    "sidebar-border": "oklch(0.922 0 0)",
    "sidebar-ring": "oklch(0.708 0 0)",
  },
  dark: {
    background: "oklch(0.145 0 0)",
    foreground: "oklch(0.985 0 0)",
    card: "oklch(0.205 0 0)",
    "card-foreground": "oklch(0.985 0 0)",
    popover: "oklch(0.205 0 0)",
    "popover-foreground": "oklch(0.985 0 0)",
    primary: "oklch(0.87 0 0)",
    "primary-foreground": "oklch(0.205 0 0)",
    secondary: "oklch(0.269 0 0)",
    "secondary-foreground": "oklch(0.985 0 0)",
    muted: "oklch(0.269 0 0)",
    "muted-foreground": "oklch(0.708 0 0)",
    accent: "oklch(0.87 0 0)",
    "accent-foreground": "oklch(0.205 0 0)",
    destructive: "oklch(0.704 0.191 22.216)",
    border: "oklch(1 0 0 / 10%)",
    input: "oklch(1 0 0 / 15%)",
    ring: "oklch(0.556 0 0)",
    sidebar: "oklch(0.205 0 0)",
    "sidebar-foreground": "oklch(0.985 0 0)",
    "sidebar-primary": "oklch(0.488 0.243 264.376)",
    "sidebar-primary-foreground": "oklch(0.985 0 0)",
    "sidebar-accent": "oklch(0.269 0 0)",
    "sidebar-accent-foreground": "oklch(0.985 0 0)",
    "sidebar-border": "oklch(1 0 0 / 10%)",
    "sidebar-ring": "oklch(0.556 0 0)",
  },
};

export function applyThemeClass(args: { enabled: boolean }) {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.classList.toggle("dark", args.enabled);
}

export function buildThemeOverrideCss(args: { themeOverrides: Record<ThemeModeName, ThemeOverrideValues> }) {
  const blocks: string[] = [];

  for (const mode of ["light", "dark"] as const) {
    const overrides = args.themeOverrides[mode];
    const declarations = Object.entries(overrides)
      .filter((entry): entry is [ThemeTokenName, string] => Boolean(entry[1]?.trim()))
      .map(([token, value]) => `--${token}: ${value};`);

    if (declarations.length === 0) {
      continue;
    }

    const selector = mode === "light" ? ":root" : ".dark";
    blocks.push(`${selector}{${declarations.join("")}}`);
  }

  return blocks.join("\n");
}

export function applyThemeOverrides(args: { themeOverrides: Record<ThemeModeName, ThemeOverrideValues> }) {
  if (typeof document === "undefined") {
    return;
  }

  const styleId = "stave-theme-overrides";
  const css = buildThemeOverrideCss({ themeOverrides: args.themeOverrides });
  let element = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!css) {
    element?.remove();
    return;
  }

  if (!element) {
    element = document.createElement("style");
    element.id = styleId;
    document.head.appendChild(element);
  }

  element.textContent = css;
}

export function applyFontOverrides(args: {
  messageFontFamily: string;
  messageMonoFontFamily: string;
  messageKoreanFontFamily: string;
}) {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const sans = [args.messageFontFamily, args.messageKoreanFontFamily, "sans-serif"]
    .filter(Boolean)
    .join(", ");
  const mono = [args.messageMonoFontFamily, "monospace"]
    .filter(Boolean)
    .join(", ");
  root.style.setProperty("--font-sans", sans);
  root.style.setProperty("--font-mono", mono);
}

export function resolveDarkModeForTheme(args: { themeMode: "light" | "dark" | "system"; fallback?: boolean }) {
  if (args.themeMode === "dark") {
    return true;
  }
  if (args.themeMode === "light") {
    return false;
  }
  if (typeof window === "undefined") {
    return args.fallback ?? true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
