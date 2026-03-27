import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import type { ReplayedTurnEvent } from "@/lib/db/turns.db";
import { formatTurnEventLabel } from "@/lib/providers/turn-diagnostics";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export function ReplayEventDetailBlock(args: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-border/70 bg-background/50 px-3 py-2", args.className)}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{args.label}</p>
      <div className="mt-1 min-w-0 text-sm text-foreground">{args.children}</div>
    </div>
  );
}

export function ReplayEventDetail(args: { item: ReplayedTurnEvent }) {
  const { event } = args.item;

  switch (event.type) {
    case "text":
    case "thinking":
      return (
        <ReplayEventDetailBlock label={event.type === "thinking" ? "Reasoning chunk" : "Text chunk"}>
          <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-sans text-sm">{event.text}</pre>
        </ReplayEventDetailBlock>
      );
    case "tool":
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant={event.state === "output-error" ? "destructive" : "secondary"}>
              {event.state}
            </Badge>
            {event.toolUseId ? <Badge variant="outline">{event.toolUseId}</Badge> : null}
          </div>
          <ReplayEventDetailBlock label="Tool input">
            <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs">{event.input}</pre>
          </ReplayEventDetailBlock>
          {event.output?.trim() ? (
            <ReplayEventDetailBlock label={event.state === "input-streaming" ? "Live output" : "Tool output"}>
              <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs">{event.output}</pre>
            </ReplayEventDetailBlock>
          ) : null}
        </div>
      );
    case "tool_result":
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {event.isError ? <Badge variant="destructive">Error</Badge> : null}
            {event.isPartial ? <Badge variant="secondary">Partial</Badge> : null}
            <Badge variant="outline">{event.tool_use_id}</Badge>
          </div>
          <ReplayEventDetailBlock label="Result output">
            <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs">{event.output}</pre>
          </ReplayEventDetailBlock>
        </div>
      );
    case "diff":
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{event.filePath}</Badge>
            {event.status ? <Badge variant="secondary">{event.status}</Badge> : null}
          </div>
          <ReplayEventDetailBlock label="Change payload">
            <p>old {event.oldContent.length} chars · new {event.newContent.length} chars</p>
          </ReplayEventDetailBlock>
        </div>
      );
    case "approval":
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{event.toolName}</Badge>
            <Badge variant="secondary">{event.requestId}</Badge>
          </div>
          <ReplayEventDetailBlock label="Approval request">
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{event.description}</p>
          </ReplayEventDetailBlock>
        </div>
      );
    case "user_input":
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{event.toolName}</Badge>
            <Badge variant="secondary">{event.requestId}</Badge>
          </div>
          <ReplayEventDetailBlock label="Questions">
            <div className="space-y-2">
              {event.questions.map((question, index) => (
                <div key={`${question.header}-${index}`} className="rounded-sm border border-border/70 bg-card/60 px-2 py-1.5">
                  <p className="font-medium">{question.header}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-muted-foreground">{question.question}</p>
                </div>
              ))}
            </div>
          </ReplayEventDetailBlock>
        </div>
      );
    case "provider_conversation":
      return (
        <ReplayEventDetailBlock label="Provider conversation">
          <p className="font-mono text-xs break-words [overflow-wrap:anywhere]">{event.nativeConversationId}</p>
        </ReplayEventDetailBlock>
      );
    case "usage":
      return (
        <ReplayEventDetailBlock label="Token and cost snapshot">
          <p>
            input {event.inputTokens} · output {event.outputTokens}
            {event.cacheReadTokens != null ? ` · cache read ${event.cacheReadTokens}` : ""}
            {event.cacheCreationTokens != null ? ` · cache write ${event.cacheCreationTokens}` : ""}
            {event.totalCostUsd != null ? ` · $${event.totalCostUsd.toFixed(4)}` : ""}
          </p>
        </ReplayEventDetailBlock>
      );
    case "prompt_suggestions":
      return (
        <ReplayEventDetailBlock label="Prompt suggestions">
          <div className="flex flex-wrap gap-2">
            {event.suggestions.map((suggestion) => (
              <Badge key={suggestion} variant="outline">{suggestion}</Badge>
            ))}
          </div>
        </ReplayEventDetailBlock>
      );
    case "plan_ready":
      return (
        <ReplayEventDetailBlock label="Plan output">
          <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-sans text-sm">{event.planText}</pre>
        </ReplayEventDetailBlock>
      );
    case "system":
      return (
        <ReplayEventDetailBlock label="System notice">
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{event.content}</p>
        </ReplayEventDetailBlock>
      );
    case "error":
      return (
        <ReplayEventDetailBlock label="Error" className="border-destructive/30 bg-destructive/8">
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-destructive">{event.message}</p>
        </ReplayEventDetailBlock>
      );
    case "done":
      return (
        <ReplayEventDetailBlock label="Completion">
          <p>{event.stop_reason ? `stop reason: ${event.stop_reason}` : "Turn completed."}</p>
        </ReplayEventDetailBlock>
      );
  }
}

export function ReplayEventCard(args: {
  item: ReplayedTurnEvent;
  timeAnchor: number;
}) {
  const { item, timeAnchor } = args;

  return (
    <div
      key={item.persisted.id}
      className={cn(
        "rounded-md border border-border/70 bg-background/50 px-3 py-3",
        item.event.type === "error" && "border-destructive/30 bg-destructive/6"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{formatTurnEventLabel({ event: item.event })}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            seq {item.persisted.sequence} · {formatTaskUpdatedAt({ value: item.persisted.createdAt, now: timeAnchor })}
          </p>
        </div>
        <Badge variant={item.event.type === "error" ? "destructive" : "outline"} className="shrink-0">
          {item.event.type}
        </Badge>
      </div>
      <div className="mt-3">
        <ReplayEventDetail item={item} />
      </div>
    </div>
  );
}
