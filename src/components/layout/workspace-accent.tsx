import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const WORKSPACE_ACCENT_VARS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--provider-codex)",
  "var(--provider-claude)",
] as const;

export function getWorkspaceAccentTone(args: { workspaceName: string }) {
  let hash = 0;
  for (let index = 0; index < args.workspaceName.length; index += 1) {
    hash = (hash * 31 + args.workspaceName.charCodeAt(index)) | 0;
  }
  const accent = WORKSPACE_ACCENT_VARS[Math.abs(hash) % WORKSPACE_ACCENT_VARS.length]!;
  return {
    background: `color-mix(in oklch, ${accent} 14%, var(--card))`,
    foreground: `color-mix(in oklch, ${accent} 54%, var(--foreground))`,
    border: `color-mix(in oklch, ${accent} 20%, var(--border))`,
  };
}

export function WorkspaceIdentityMark(args: { workspaceName: string; className?: string; iconClassName?: string }) {
  const tone = getWorkspaceAccentTone({ workspaceName: args.workspaceName });
  return (
    <span
      className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-[0.45rem] border", args.className)}
      style={{
        backgroundColor: tone.background,
        color: tone.foreground,
        borderColor: tone.border,
      }}
    >
      <Layers className={cn("size-3", args.iconClassName)} />
    </span>
  );
}
