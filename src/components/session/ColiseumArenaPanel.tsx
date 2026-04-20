import { Crown, Swords, Trophy, X } from "lucide-react";
import { Fragment, memo, useMemo } from "react";
import {
  Badge,
  Button,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WaveIndicator,
} from "@/components/ui";
import { Message, MessageContent, ModelIcon } from "@/components/ai-elements";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import {
  getProviderLabel,
  getProviderWaveToneClass,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";

/**
 * Coliseum arena — horizontal N-column split view rendering one branch task
 * per column. Shown in place of the single `ChatPanel` when the active task
 * has a live Coliseum group.
 *
 * Design notes:
 * - Reuses `AssistantMessageBody` (which already accepts a `taskId` prop) so
 *   each column renders the full assistant trace experience without forcing
 *   us to refactor the global `ChatPanel` (which reads `activeTaskId` directly
 *   from the store).
 * - Minimal UI on purpose — no virtualization, no scroll memory, no plan
 *   viewer. Branches are ephemeral; richness belongs to the promoted parent.
 */

const EMPTY_MESSAGES: ChatMessage[] = [];

interface ColiseumArenaPanelProps {
  parentTaskId: string;
}

export const ColiseumArenaPanel = memo(ColiseumArenaPanelImpl);

function ColiseumArenaPanelImpl(args: ColiseumArenaPanelProps) {
  const group = useAppStore(
    (state) => state.activeColiseumsByTask[args.parentTaskId],
  );
  const dismissColiseum = useAppStore((state) => state.dismissColiseum);

  if (!group) {
    // Defensive: caller checks this first; render nothing rather than
    // crashing if parent task id / group wiring ever get out of sync.
    return null;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border/80 bg-card px-3 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <Swords className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium text-foreground">
            Coliseum — {group.branchTaskIds.length} entrants
          </span>
          <Badge
            variant="secondary"
            className="shrink-0 rounded-sm text-[10px] uppercase tracking-[0.14em]"
          >
            Parallel
          </Badge>
          <span className="shrink-0 text-xs text-muted-foreground">
            Pick a champion to keep its answer in this task.
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-sm px-2 text-xs shadow-none"
            onClick={() =>
              dismissColiseum({ parentTaskId: args.parentTaskId })
            }
          >
            Dismiss
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
          {group.branchTaskIds.map((branchTaskId, index) => {
            const isLast = index === group.branchTaskIds.length - 1;
            return (
              <Fragment key={branchTaskId}>
                <ResizablePanel
                  defaultSize={100 / group.branchTaskIds.length}
                  minSize={15}
                  className="flex min-w-0 flex-col"
                >
                  <ColiseumBranchColumn
                    parentTaskId={args.parentTaskId}
                    branchTaskId={branchTaskId}
                    index={index}
                    totalBranches={group.branchTaskIds.length}
                  />
                </ResizablePanel>
                {!isLast ? (
                  <ResizableHandle
                    withHandle={false}
                    className="bg-border/80"
                  />
                ) : null}
              </Fragment>
            );
          })}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

interface ColiseumBranchColumnProps {
  parentTaskId: string;
  branchTaskId: string;
  index: number;
  totalBranches: number;
}

function ColiseumBranchColumn(args: ColiseumBranchColumnProps) {
  const [
    branchTask,
    messages,
    activeTurnId,
    chatStreamingEnabled,
    showInterimMessages,
    pickColiseumChampion,
    closeColiseumBranch,
  ] = useAppStore(
    useShallow((state) => {
      const branchTask = state.tasks.find(
        (task) => task.id === args.branchTaskId,
      );
      return [
        branchTask ?? null,
        state.messagesByTask[args.branchTaskId] ?? EMPTY_MESSAGES,
        state.activeTurnIdsByTask[args.branchTaskId],
        state.settings.chatStreamingEnabled,
        state.settings.showInterimMessages,
        state.pickColiseumChampion,
        state.closeColiseumBranch,
      ] as const;
    }),
  );

  const assistantMessages = useMemo(
    () => messages.filter((msg) => msg.role === "assistant"),
    [messages],
  );
  // The column header reflects the branch's *configured* provider/model. The
  // branch `Task` record is the source of truth for provider; the first
  // assistant message carries the model slug we streamed under. Fall back to
  // empty so the header still renders while the turn is still warming up.
  const firstAssistant = assistantMessages.at(0);
  const headerProvider: ProviderId = branchTask?.provider ?? "stave";
  const headerModel = firstAssistant?.model ?? "";
  const isStreaming = Boolean(activeTurnId);
  const canPromote = !isStreaming || assistantMessages.some((m) => !m.isStreaming);

  // Find the first user message at the fan-out boundary to display prompt in
  // the header; branches all share the same prompt so we could render it once
  // but showing per-column keeps each column self-contained.
  const promptMessage = useMemo(
    () => messages.find((msg) => msg.role === "user"),
    [messages],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-col gap-1 border-b border-border/60 bg-card/80 px-3 py-2 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <ModelIcon
            providerId={headerProvider}
            model={headerModel || undefined}
            className="size-3.5"
          />
          <span className="min-w-0 truncate font-medium text-foreground">
            {headerModel
              ? toHumanModelName({ model: headerModel })
              : getProviderLabel({
                  providerId: headerProvider,
                  variant: "full",
                })}
          </span>
          {isStreaming ? (
            <WaveIndicator
              className={cn(
                "size-3",
                getProviderWaveToneClass({
                  providerId: headerProvider,
                  model: headerModel || undefined,
                }),
              )}
              animate
            />
          ) : null}
          <span className="ml-auto shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {args.index + 1} / {args.totalBranches}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-7 flex-1 gap-1.5 rounded-sm px-2 text-xs shadow-none"
            disabled={!canPromote}
            onClick={() =>
              pickColiseumChampion({
                parentTaskId: args.parentTaskId,
                championTaskId: args.branchTaskId,
              })
            }
          >
            <Crown className="size-3.5" />
            Pick champion
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Close this branch"
            title="Close this branch"
            onClick={() =>
              closeColiseumBranch({ branchTaskId: args.branchTaskId })
            }
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {promptMessage ? (
          <div className="mb-3 rounded-md border border-border/60 bg-muted/40 px-2.5 py-2 text-xs text-foreground">
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Prompt
            </div>
            <div className="whitespace-pre-wrap break-words">
              {promptMessage.content || "(empty)"}
            </div>
          </div>
        ) : null}
        {assistantMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Trophy className="size-3.5" />
              Waiting for response…
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {assistantMessages.map((message) => (
              <Message key={message.id} from="assistant">
                <div className="flex w-full max-w-none flex-col gap-1.5">
                  <MessageContent>
                    <AssistantMessageBody
                      message={message}
                      taskId={args.branchTaskId}
                      messageId={message.id}
                      streamingEnabled={chatStreamingEnabled}
                      showInterimMessages={showInterimMessages}
                      traceExpansionMode="auto"
                    />
                  </MessageContent>
                </div>
              </Message>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
