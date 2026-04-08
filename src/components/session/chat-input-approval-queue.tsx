import { ConfirmationCompact } from "@/components/ai-elements/confirmation";
import { Badge, Kbd } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ApprovalPart } from "@/types/chat";

export interface PendingApprovalQueueItem {
  messageId: string;
  part: ApprovalPart;
}

interface ChatInputApprovalQueueProps {
  approvals: readonly PendingApprovalQueueItem[];
  compact?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onResolveApproval: (args: { messageId: string; approved: boolean }) => void;
}

export function ChatInputApprovalQueue(args: ChatInputApprovalQueueProps) {
  const { approvals, compact, disabled, disabledReason, onResolveApproval } = args;

  if (approvals.length === 0) {
    return null;
  }

  const latestApproval = approvals[0];
  const latestToolName = latestApproval?.part.toolName?.trim() || "Latest request";

  return (
    <section
      aria-label="Approval queue"
      className={cn(
        "mb-3 rounded-xl border border-warning/35 bg-card/95 shadow-sm supports-backdrop-filter:backdrop-blur-xs",
        compact ? "px-2.5 py-2.5" : "px-3 py-3",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning" className="rounded-sm text-[10px] uppercase tracking-[0.18em]">
          Approval Queue
        </Badge>
        <span className="text-sm font-medium text-foreground">
          {approvals.length === 1 ? "1 request waiting" : `${approvals.length} requests waiting`}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {approvals.length === 1
          ? `${latestToolName} is waiting for approval.`
          : `${latestToolName} is the latest approval request. Resolve requests here without reopening the trace.`}
      </p>

      {!disabled ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Press <Kbd className="mx-1 h-5 px-1.5 text-[0.75rem]">Enter</Kbd> to approve the latest request.
        </p>
      ) : null}

      <div className={cn("mt-3 space-y-2.5", approvals.length > 1 && "max-h-72 overflow-y-auto pr-1")}>
        {approvals.map((approval, index) => (
          <div key={`${approval.messageId}:${approval.part.requestId}`} className="space-y-1">
            {approvals.length > 1 ? (
              <div className="flex items-center justify-between gap-2 px-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
                <span>{index === 0 ? "Latest" : "Queued"}</span>
                <span className="truncate text-right normal-case tracking-normal">
                  {approval.part.toolName}
                </span>
              </div>
            ) : null}

            <ConfirmationCompact
              toolName={approval.part.toolName}
              description={approval.part.description}
              state={approval.part.state}
              disabled={disabled}
              disabledReason={disabledReason}
              showShortcutHint={false}
              onApprove={() => onResolveApproval({ messageId: approval.messageId, approved: true })}
              onReject={() => onResolveApproval({ messageId: approval.messageId, approved: false })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
