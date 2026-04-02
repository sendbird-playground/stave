import type { ReactNode } from "react";
import { useMemo } from "react";
import { CheckCircle2, Circle, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
  MessageResponse,
  OrchestrationCard,
  Reasoning,
  ReasoningContent,
  StaveProcessingCard,
  ToolInput,
  ToolOutput,
  parseSubagentToolInput,
  parseTodoInput,
} from "@/components/ai-elements";
import { ChangedFilesBlock, ImageAttachmentBlock, ReferencedFilesBlock } from "@/components/session/chat-panel-file-blocks";
import { MessagePartRenderer, toToolDisplayName } from "@/components/session/chat-panel-message-parts";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/chat";
import { buildAssistantTrace, joinReasoningText, type AssistantTraceEntry } from "./assistant-trace-builder";

function formatElapsedSecondsLabel(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function MetaRow(args: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{args.children}</div>;
}

function MetaBadge(args: { children: ReactNode; variant?: "outline" | "secondary" | "success" | "warning" }) {
  return (
    <Badge variant={args.variant ?? "outline"} className="h-5 rounded-md px-1.5 font-normal">
      {args.children}
    </Badge>
  );
}

function toStepStatus(args: { entry: AssistantTraceEntry; isStreaming: boolean }) {
  switch (args.entry.kind) {
    case "reasoning":
      return args.entry.isStreaming ? "active" : "done";
    case "assistant_text":
      return "done";
    case "tool":
    case "subagent":
    case "todo":
      return args.entry.part.state === "input-streaming"
        ? "active"
        : args.entry.part.state === "output-available" || args.entry.part.state === "output-error"
        ? "done"
        : "pending";
    case "approval":
      return args.entry.part.state === "approval-requested" ? "active" : "done";
    case "user_input":
      return args.entry.part.state === "input-requested" ? "active" : "done";
    case "diff":
    case "system":
      return "done";
    case "orchestration":
      return args.entry.part.status === "done" ? "done" : "active";
    case "stave_processing":
      return args.isStreaming ? "active" : "done";
  }
}

function ToolStepDetail(args: { input: string; output?: string; state?: "input-streaming" | "input-available" | "output-available" | "output-error" }) {
  return (
    <div className="space-y-2">
      <ToolInput input={args.input} />
      {(args.state !== "input-streaming" || args.output?.trim()) ? (
        <ToolOutput
          label={args.state === "input-streaming" ? "Live output" : undefined}
          output={args.output ? <pre className="whitespace-pre-wrap text-sm">{args.output}</pre> : null}
          errorText={args.state === "output-error" ? (args.output ?? "Tool failed.") : undefined}
        />
      ) : null}
    </div>
  );
}

function SubagentStepDetail(args: {
  input: string;
  output?: string;
  progressMessages?: string[];
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
}) {
  const parsed = useMemo(() => parseSubagentToolInput({ input: args.input }), [args.input]);
  return (
    <div className="space-y-2">
      {args.progressMessages?.length ? (
        <div className="rounded-md border border-border/70 bg-muted/25 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Progress</p>
          <ul className="mt-2 space-y-1.5">
            {args.progressMessages.map((message, index) => (
              <li key={`${message}-${index}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
                <span>{message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ToolInput input={parsed.prompt ?? parsed.raw} />
      {args.state !== "input-streaming" ? (
        <ToolOutput
          output={args.output ? <pre className="whitespace-pre-wrap text-sm">{args.output}</pre> : null}
          errorText={args.state === "output-error" ? (args.output ?? "Subagent failed.") : undefined}
        />
      ) : null}
    </div>
  );
}

function TodoStepDetail(args: { input: string }) {
  const todos = useMemo(() => parseTodoInput({ input: args.input }).todos, [args.input]);
  const completed = todos.filter((todo) => todo.status === "completed").length;

  return (
    <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Todo {todos.length > 0 ? `${completed}/${todos.length}` : ""}
      </p>
      {todos.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No todos.</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {todos.map((todo, index) => (
            <li key={`${todo.content}-${index}`} className="flex items-start gap-2 text-sm text-foreground">
              {todo.status === "completed" ? (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : todo.status === "in_progress" ? (
                <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
              ) : (
                <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />
              )}
              <span
                className={cn(
                  todo.status === "completed" && "text-muted-foreground line-through",
                  todo.status === "in_progress" && "font-medium text-foreground",
                  todo.status === "pending" && "text-muted-foreground",
                )}
              >
                {todo.content}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AssistantTraceEntryView(args: {
  entry: AssistantTraceEntry;
  isStreaming: boolean;
  taskId: string;
  messageId: string;
}) {
  const { entry, isStreaming, taskId, messageId } = args;
  const status = toStepStatus({ entry, isStreaming });

  switch (entry.kind) {
    case "reasoning": {
      const reasoningText = joinReasoningText(entry.parts);
      return (
        <ChainOfThoughtStep
          title={entry.isStreaming ? "Thinking" : "Reasoning"}
          kind="thinking"
          status={status}
          defaultOpen={entry.isStreaming}
          openWhen={entry.isStreaming}
          meta={(
            <MetaRow>
              {entry.isStreaming ? <MetaBadge variant="warning">Live</MetaBadge> : null}
              <MetaBadge>{entry.parts.length === 1 ? "1 chunk" : `${entry.parts.length} chunks`}</MetaBadge>
            </MetaRow>
          )}
        >
          <Reasoning isStreaming={entry.isStreaming} defaultOpen>
            <ReasoningContent>{reasoningText || "Thinking..."}</ReasoningContent>
          </Reasoning>
        </ChainOfThoughtStep>
      );
    }
    case "assistant_text":
      return (
        <ChainOfThoughtStep
          title="Assistant message"
          kind="system"
          status={status}
        >
          <div className="space-y-2.5">
            {entry.parts.map((part, index) => (
              <MessageResponse key={`${entry.id}-${index}`}>{part.text}</MessageResponse>
            ))}
          </div>
        </ChainOfThoughtStep>
      );
    case "tool":
      return (
        <ChainOfThoughtStep
          title={toToolDisplayName(entry.part.toolName)}
          kind="tool"
          status={status}
          defaultOpen={entry.part.state === "input-streaming"}
          openWhen={entry.part.state === "input-streaming"}
          meta={(
            <MetaRow>
              {entry.part.toolUseId ? <MetaBadge>{entry.part.toolUseId}</MetaBadge> : null}
              {entry.part.elapsedSeconds != null && entry.part.elapsedSeconds > 0 ? (
                <MetaBadge>{formatElapsedSecondsLabel(entry.part.elapsedSeconds)}</MetaBadge>
              ) : null}
            </MetaRow>
          )}
        >
          <ToolStepDetail input={entry.part.input} output={entry.part.output} state={entry.part.state} />
        </ChainOfThoughtStep>
      );
    case "subagent": {
      const parsed = parseSubagentToolInput({ input: entry.part.input });
      return (
        <ChainOfThoughtStep
          title={parsed.description ?? parsed.subagentType ?? "Subagent"}
          kind="agent"
          status={status}
          defaultOpen={entry.part.state === "input-streaming"}
          openWhen={entry.part.state === "input-streaming"}
          meta={(
            <MetaRow>
              {parsed.subagentType ? <MetaBadge variant="secondary">{parsed.subagentType}</MetaBadge> : null}
              {entry.part.progressMessages?.length ? (
                <MetaBadge>{entry.part.progressMessages.length} updates</MetaBadge>
              ) : null}
              {entry.part.elapsedSeconds != null && entry.part.elapsedSeconds > 0 ? (
                <MetaBadge>{formatElapsedSecondsLabel(entry.part.elapsedSeconds)}</MetaBadge>
              ) : null}
            </MetaRow>
          )}
        >
          <SubagentStepDetail
            input={entry.part.input}
            output={entry.part.output}
            progressMessages={entry.part.progressMessages}
            state={entry.part.state}
          />
        </ChainOfThoughtStep>
      );
    }
    case "todo":
      {
        const todos = parseTodoInput({ input: entry.part.input }).todos;
        const completedCount = todos.filter((todo) => todo.status === "completed").length;
        return (
          <ChainOfThoughtStep
            title="Todo"
            kind="tool"
            status={status}
            defaultOpen={entry.part.state === "input-streaming"}
            openWhen={entry.part.state === "input-streaming"}
            meta={todos.length > 0 ? (
              <MetaRow>
                <MetaBadge>{`${completedCount}/${todos.length}`}</MetaBadge>
              </MetaRow>
            ) : undefined}
          >
            <TodoStepDetail input={entry.part.input} />
          </ChainOfThoughtStep>
        );
      }
    case "diff":
      {
        const pendingCount = entry.parts.filter((part) => part.status === "pending").length;
        return (
          <ChainOfThoughtStep
            title={entry.parts.length === 1 ? "Changed file" : "Changed files"}
            kind="tool"
            status={status}
            defaultOpen={pendingCount > 0}
            meta={(
              <MetaRow>
                <MetaBadge>{entry.parts.length === 1 ? "1 file" : `${entry.parts.length} files`}</MetaBadge>
                {pendingCount > 0 ? <MetaBadge variant="warning">{pendingCount} pending</MetaBadge> : null}
              </MetaRow>
            )}
          >
            <ChangedFilesBlock parts={entry.parts} taskId={taskId} messageId={messageId} />
          </ChainOfThoughtStep>
        );
      }
    case "approval":
      return (
        <ChainOfThoughtStep
          title={`Approval: ${entry.part.toolName}`}
          kind="system"
          status={status}
          defaultOpen
        >
          <MessagePartRenderer part={entry.part} taskId={taskId} messageId={messageId} />
        </ChainOfThoughtStep>
      );
    case "user_input":
      return (
        <ChainOfThoughtStep
          title={`Input: ${entry.part.toolName}`}
          kind="system"
          status={status}
          defaultOpen
        >
          <MessagePartRenderer part={entry.part} taskId={taskId} messageId={messageId} />
        </ChainOfThoughtStep>
      );
    case "system":
      return (
        <ChainOfThoughtStep
          title={entry.part.content.split("\n").find(Boolean)?.trim() || "System"}
          kind="system"
          status={status}
          defaultOpen={entry.part.compactBoundary != null}
        >
          <MessagePartRenderer part={entry.part} taskId={taskId} messageId={messageId} />
        </ChainOfThoughtStep>
      );
    case "orchestration":
      return (
        <ChainOfThoughtStep title="Orchestration" kind="system" status={status} defaultOpen={isStreaming}>
          <OrchestrationCard part={entry.part} />
        </ChainOfThoughtStep>
      );
    case "stave_processing":
      return (
        <ChainOfThoughtStep title="Execution routing" kind="system" status={status} defaultOpen={isStreaming}>
          <StaveProcessingCard part={entry.part} />
        </ChainOfThoughtStep>
      );
  }
}

export function AssistantMessageBody(args: {
  message: Pick<ChatMessage, "content" | "parts" | "isStreaming">;
  taskId: string;
  messageId: string;
  streamingEnabled: boolean;
}) {
  const { message, taskId, messageId, streamingEnabled } = args;
  const isActivelyStreaming = Boolean(message.isStreaming);
  const isStreaming = streamingEnabled && isActivelyStreaming;
  const trace = useMemo(() => buildAssistantTrace({ message }), [message]);

  if (
    !trace.showStreamingPlaceholder
    && trace.entries.length === 0
    && trace.responseParts.length === 0
    && trace.fileContextParts.length === 0
    && trace.imageContextParts.length === 0
  ) {
    return <p className="text-sm italic text-muted-foreground">No response.</p>;
  }

  return (
    <>
      {(trace.showStreamingPlaceholder || trace.entries.length > 0) ? (
        <ChainOfThought
          isStreaming={isStreaming}
          defaultOpen={isStreaming}
          openWhen={isStreaming}
          collapseWhen={!isStreaming}
        >
          <ChainOfThoughtTrigger />
          <ChainOfThoughtContent className="space-y-1.5">
            {trace.showStreamingPlaceholder ? (
              <ChainOfThoughtStep title="Thinking" kind="thinking" status="active" defaultOpen openWhen>
                <Reasoning isStreaming defaultOpen>
                  <ReasoningContent>Thinking...</ReasoningContent>
                </Reasoning>
              </ChainOfThoughtStep>
            ) : null}
            {trace.entries.map((entry) => (
              <AssistantTraceEntryView
                key={entry.id}
                entry={entry}
                isStreaming={isStreaming}
                taskId={taskId}
                messageId={messageId}
              />
            ))}
          </ChainOfThoughtContent>
        </ChainOfThought>
      ) : null}

      {trace.responseParts.length > 0 ? (
        <div className={cn(trace.entries.length > 0 && "mt-4", "space-y-3")}>
          {trace.responseParts.map((part, index) => (
            <MessageResponse
              key={`${messageId}-response-${index}`}
              isStreaming={isStreaming && index === trace.responseParts.length - 1}
            >
              {part.text}
            </MessageResponse>
          ))}
        </div>
      ) : null}

      {trace.fileContextParts.length > 0 ? (
        <div className="mt-4">
          <ReferencedFilesBlock parts={trace.fileContextParts} />
        </div>
      ) : null}

      {trace.imageContextParts.length > 0 ? (
        <div className="mt-4">
          <ImageAttachmentBlock parts={trace.imageContextParts} />
        </div>
      ) : null}
    </>
  );
}
