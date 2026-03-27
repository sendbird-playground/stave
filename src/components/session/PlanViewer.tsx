import { useEffect, useState } from "react";
import { ClipboardCheck, Minus, Maximize2 } from "lucide-react";
import { Button, Textarea, WaveIndicator } from "@/components/ui";
import { MessageResponse } from "@/components/ai-elements";
import { APPROVE_PLAN_MESSAGE } from "@/lib/providers/plan-response";
import { useAppStore } from "@/store/app.store";
import { resolvePlanViewerState } from "@/components/session/plan-viewer.utils";
import { useShallow } from "zustand/react/shallow";

type ViewState = "normal" | "minimized" | "expanded";

export function PlanViewer() {
  const [revising, setRevising] = useState(false);
  const [revisionText, setRevisionText] = useState("");
  const [viewState, setViewState] = useState<ViewState>("normal");

  const [activeTaskId, activeProvider, claudePermissionMode, sendUserMessage] = useAppStore(
    useShallow((state) => [
      state.activeTaskId,
      state.tasks.find((task) => task.id === state.activeTaskId)?.provider ?? state.draftProvider,
      state.settings.claudePermissionMode,
      state.sendUserMessage,
    ] as const),
  );
  const lastMessage = useAppStore((state) => {
    const messages = state.messagesByTask[state.activeTaskId];
    return messages?.at(-1);
  });
  const isTurnActive = useAppStore((state) => Boolean(state.activeTurnIdsByTask[state.activeTaskId]));
  const { planText, isPlanPreparing, isPlanPending } = resolvePlanViewerState({
    activeProvider,
    claudePermissionMode,
    lastMessage,
    isTurnActive,
  });

  // Reset view state when a new plan arrives so it opens fully
  useEffect(() => {
    if (isPlanPending) {
      setViewState("normal");
      setRevising(false);
      setRevisionText("");
    }
  }, [isPlanPending]);

  if (!isPlanPreparing && !isPlanPending) {
    return null;
  }

  function handleApprove() {
    sendUserMessage({ taskId: activeTaskId, content: APPROVE_PLAN_MESSAGE });
    setRevising(false);
    setRevisionText("");
  }

  function handleRevise() {
    if (!revisionText.trim()) return;
    sendUserMessage({ taskId: activeTaskId, content: revisionText.trim() });
    setRevising(false);
    setRevisionText("");
  }

  const isMinimized = viewState === "minimized";
  const isExpanded = viewState === "expanded";

  return (
    <div
      className={[
        "absolute bottom-full left-0 right-0 z-20 px-3 pb-2 sm:px-4",
        isExpanded ? "top-0 bottom-0" : "",
      ].join(" ")}
    >
      <div
        className={[
          "mx-auto flex max-w-5xl flex-col rounded-xl border border-border/80 bg-card shadow-lg",
          isExpanded ? "h-full" : "",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/80 px-4 py-2.5">
          <ClipboardCheck className="size-4 text-primary" />
          <p className="flex-1 text-sm font-medium">
            {isPlanPreparing ? "Preparing plan…" : "Review Claude's Plan"}
          </p>
          {isPlanPreparing ? (
            <WaveIndicator className="text-primary" />
          ) : (
            <>
              <button
                onClick={() => setViewState(isMinimized ? "normal" : "minimized")}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={isMinimized ? "Restore" : "Minimize"}
              >
                <Minus className="size-4" />
              </button>
              <button
                onClick={() => setViewState(isExpanded ? "normal" : "expanded")}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={isExpanded ? "Restore" : "Expand"}
              >
                <Maximize2 className="size-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Body — hidden when preparing or minimized */}
        {!isPlanPreparing && !isMinimized && (
          <>
            {lastMessage && (
              <div className={["overflow-y-auto px-4 py-3", isExpanded ? "flex-1" : "max-h-72"].join(" ")}>
                <MessageResponse>{planText || "Plan ready."}</MessageResponse>
              </div>
            )}
            {revising ? (
              <div className="shrink-0 p-3">
                <Textarea
                  autoFocus
                  value={revisionText}
                  onChange={(e) => setRevisionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleRevise();
                    }
                    if (e.key === "Escape") {
                      setRevising(false);
                      setRevisionText("");
                    }
                  }}
                  placeholder="Tell Claude what to do instead..."
                  className="min-h-[72px] rounded-lg border-border/70 bg-background text-base leading-7"
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={handleRevise} disabled={!revisionText.trim()}>
                    Send
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setRevising(false); setRevisionText(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3">
                <Button size="sm" onClick={handleApprove}>
                  <ClipboardCheck className="size-3.5" />
                  Approve plan and start coding
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRevising(true)}>
                  Tell Claude what to do instead
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
