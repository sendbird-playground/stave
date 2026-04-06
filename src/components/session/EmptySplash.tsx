import type { ReactNode } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Kbd, KbdGroup, KbdSeparator } from "@/components/ui";
import { getProviderIconUrl } from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

interface EmptySplashProps {
  description?: string;
  layout?: "centered" | "top-card";
  onCreateTask?: () => void;
  showCreateTaskAction?: boolean;
  supplementaryContent?: ReactNode;
  title?: string;
}

export function EmptySplash({
  description = "Select a task to continue, or create one to start a new conversation with your agent.",
  layout = "centered",
  onCreateTask,
  showCreateTaskAction = false,
  supplementaryContent,
  title = "Stave",
}: EmptySplashProps) {
  const isDarkMode = useAppStore((state) => state.isDarkMode);
  const isMac = typeof navigator !== "undefined" && /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent);
  const shortcutModifierLabel = isMac ? "⌘" : "Ctrl";
  const isTopCard = layout === "top-card";

  return (
    <section className={cn(
      "flex min-h-0 w-full flex-1 px-6",
      isTopCard ? "items-start justify-start py-6" : "items-center justify-center py-10",
    )}
    >
      <Empty
        data-testid="empty-splash"
        className={cn(
          "border-none p-0",
          isTopCard && "max-w-5xl items-stretch gap-5 rounded-[28px] border border-border/70 bg-card/65 p-6 text-left shadow-sm supports-backdrop-filter:backdrop-blur-sm",
        )}
      >
        <EmptyHeader className={cn(isTopCard ? "max-w-none flex-row items-center gap-4" : "max-w-xl gap-3")}>
          <EmptyMedia
            variant="icon"
            className={cn(
              "rounded-2xl bg-primary/10 p-2",
              isTopCard ? "size-11 text-primary" : "size-14",
            )}
          >
            <img
              src={getProviderIconUrl({ providerId: "stave", isDarkMode })}
              alt="Stave"
              className="h-full w-full object-contain"
              draggable={false}
            />
          </EmptyMedia>
          <div className={cn("space-y-2", isTopCard && "min-w-0 space-y-1")}>
            <EmptyTitle className={cn(isTopCard ? "text-left text-base" : "text-2xl font-semibold")}>{title}</EmptyTitle>
            <EmptyDescription className={cn(isTopCard && "text-left")}>
              {description}
            </EmptyDescription>
          </div>
        </EmptyHeader>
        {supplementaryContent ? (
          <EmptyContent className={cn(isTopCard && "max-w-none items-stretch gap-3")}>
            {supplementaryContent}
          </EmptyContent>
        ) : null}
        {showCreateTaskAction ? (
          <EmptyContent className={cn(isTopCard && "max-w-none items-start")}>
            <Button onClick={onCreateTask}>
              <MessageSquarePlus className="size-4" />
              New Task
              <KbdGroup className="ml-1" aria-label={`Keyboard shortcut ${shortcutModifierLabel} N`}>
                <Kbd>{shortcutModifierLabel}</Kbd>
                <KbdSeparator>+</KbdSeparator>
                <Kbd>N</Kbd>
              </KbdGroup>
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    </section>
  );
}
