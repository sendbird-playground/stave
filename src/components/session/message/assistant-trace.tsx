import { useMemo } from "react";
import { Check, CheckCircle2, Circle, LoaderCircle } from "lucide-react";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
  MessageResponse,
  OrchestrationCard,
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

/* ─── Helpers ─────────────────────────────────────────────────────── */

function toStepStatus(args: { entry: AssistantTraceEntry; isStreaming: boolean }) {
  switch (args.entry.kind) {
    case "reasoning":
      return args.entry.isStreaming ? "active" as const : "done" as const;
    case "assistant_text":
      return "done" as const;
    case "tool":
    case "subagent":
    case "todo":
      return args.entry.part.state === "input-streaming"
        ? "active" as const
        : args.entry.part.state === "output-available" || args.entry.part.state === "output-error"
          ? "done" as const
          : "pending" as const;
    case "approval":
      return args.entry.part.state === "approval-requested" ? "active" as const : "done" as const;
    case "user_input":
      return args.entry.part.state === "input-requested" ? "active" as const : "done" as const;
    case "diff":
    case "system":
      return "done" as const;
    case "orchestration":
      return args.entry.part.status === "done" ? "done" as const : "active" as const;
    case "stave_processing":
      return args.isStreaming ? "active" as const : "done" as const;
  }
}

/* ─── Step detail components (expanded content) ───────────────────── */

function ToolStepDetail(args: {
  input: string;
  output?: string;
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
}) {
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
        <ul className="space-y-1">
          {args.progressMessages.map((message, index) => (
            <li key={`${message}-${index}`} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border" aria-hidden="true" />
              <span>{message}</span>
            </li>
          ))}
        </ul>
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
  return (
    <ol className="space-y-1.5">
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
  );
}

/* ─── Entry renderer ──────────────────────────────────────────────── */

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
          status={status}
          defaultOpen={entry.isStreaming}
          openWhen={entry.isStreaming}
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {reasoningText || "Thinking..."}
          </p>
        </ChainOfThoughtStep>
      );
    }

    /* Assistant text is NOT an accordion - content is always visible. */
    case "assistant_text":
      return (
        <div className="flex gap-3 text-sm text-muted-foreground motion-safe:animate-cot-step-in">
          <div className="relative mt-0.5 flex flex-col items-center">
            <Check className="size-4" />
            <div className="cot-connector mt-1.5 w-px flex-1 bg-border" />
          </div>
          <div className="min-w-0 flex-1 pb-4">
            {entry.parts.map((part, index) => (
              <MessageResponse key={`${entry.id}-${index}`}>{part.text}</MessageResponse>
            ))}
          </div>
        </div>
      );

    case "tool":
      return (
        <ChainOfThoughtStep
          title={toToolDisplayName(entry.part.toolName)}
          status={status}
          defaultOpen={entry.part.state === "input-streaming"}
          openWhen={entry.part.state === "input-streaming"}
        >
          <ToolStepDetail input={entry.part.input} output={entry.part.output} state={entry.part.state} />
        </ChainOfThoughtStep>
      );

    case "subagent": {
      const parsed = parseSubagentToolInput({ input: entry.part.input });
      return (
        <ChainOfThoughtStep
          title={parsed.description ?? parsed.subagentType ?? "Subagent"}
          status={status}
          defaultOpen={entry.part.state === "input-streaming"}
          openWhen={entry.part.state === "input-streaming"}
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
      return (
        <ChainOfThoughtStep
          title="Todo"
          status={status}
          defaultOpen={entry.part.state === "input-streaming"}
          openWhen={entry.part.state === "input-streaming"}
        >
          <TodoStepDetail input={entry.part.input} />
        </ChainOfThoughtStep>
      );

    case "diff":
      return (
        <ChainOfThoughtStep
          title={entry.parts.length === 1 ? "Changed file" : `${entry.parts.length} changed files`}
          status={status}
          defaultOpen={entry.parts.some((p) => p.status === "pending")}
        >
          <ChangedFilesBlock parts={entry.parts} taskId={taskId} messageId={messageId} />
        </ChainOfThoughtStep>
      );

    case "approval":
      return (
        <ChainOfThoughtStep title={`Approval: ${entry.part.toolName}`} status={status} defaultOpen>
          <MessagePartRenderer part={entry.part} taskId={taskId} messageId={messageId} />
        </ChainOfThoughtStep>
      );

    case "user_input":
      return (
        <ChainOfThoughtStep title={`Input: ${entry.part.toolName}`} status={status} defaultOpen>
          <MessagePartRenderer part={entry.part} taskId={taskId} messageId={messageId} />
        </ChainOfThoughtStep>
      );

    case "system":
      return (
        <ChainOfThoughtStep
          title={entry.part.content.split("\n").find(Boolean)?.trim() || "System"}
          status={status}
          defaultOpen={entry.part.compactBoundary != null}
        >
          <MessagePartRenderer part={entry.part} taskId={taskId} messageId={messageId} />
        </ChainOfThoughtStep>
      );

    case "orchestration":
      return (
        <ChainOfThoughtStep title="Orchestration" status={status} defaultOpen={isStreaming}>
          <OrchestrationCard part={entry.part} />
        </ChainOfThoughtStep>
      );

    case "stave_processing":
      return (
        <ChainOfThoughtStep title="Execution routing" status={status} defaultOpen={isStreaming}>
          <StaveProcessingCard part={entry.part} />
        </ChainOfThoughtStep>
      );
  }
}

/* ─── Main export ─────────────────────────────────────────────────── */

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
          <ChainOfThoughtContent>
            {trace.showStreamingPlaceholder ? (
              <ChainOfThoughtStep title="Thinking" status="active" defaultOpen openWhen>
                <p className="text-sm text-muted-foreground">Thinking...</p>
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
