import {
  Bot,
  Code2,
  Cog,
  Folder,
  Globe,
  KeyRound,
  Palette,
  ScrollText,
  SearchCheck,
  Shield,
  Sparkles,
  TerminalSquare,
  Wrench,
} from "lucide-react";

export const settingsSections = [
  { id: "general", label: "General", icon: Cog },
  { id: "projects", label: "Projects", icon: Folder },
  { id: "theme", label: "Design", icon: Palette },
  { id: "chat", label: "Chat", icon: Bot },
  { id: "muse", label: "Muse", icon: Sparkles },
  { id: "providers", label: "Providers", icon: Wrench },
  { id: "prompts", label: "Prompts", icon: ScrollText },
  { id: "skills", label: "Skills", icon: SearchCheck },
  { id: "commandPalette", label: "Command Palette", icon: KeyRound },
  { id: "commands", label: "Composer Commands", icon: KeyRound },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "editor", label: "Editor", icon: Code2 },
  { id: "tooling", label: "Tooling", icon: Shield },
  { id: "lens", label: "Lens", icon: Globe },
  { id: "developer", label: "Developer", icon: Wrench },
] as const;

export type SectionId = (typeof settingsSections)[number]["id"];

export const settingsSectionGroups: Array<{ label: string; ids: SectionId[] }> = [
  { label: "Workspace", ids: ["general", "projects"] },
  { label: "Appearance", ids: ["theme", "chat", "editor", "terminal"] },
  { label: "Providers", ids: ["muse", "providers", "prompts", "skills", "commandPalette", "commands"] },
  { label: "System", ids: ["tooling", "lens", "developer"] },
];
