import { Button, Kbd } from "@/components/ui";

interface ConfirmationCompactProps {
  toolName: string;
  description: string;
  state: "approval-requested" | "approval-responded" | "output-denied";
  onApprove?: () => void;
  onReject?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

export function ConfirmationCompact(args: ConfirmationCompactProps) {
  const { toolName, description, state, onApprove, onReject, disabled, disabledReason } = args;

  return (
    <div className="rounded-md border bg-card p-3 text-[0.875em]">
      <p className="font-semibold text-foreground">Approval required: {toolName}</p>
      <p className="mt-1 text-muted-foreground">{description}</p>
      {state === "approval-requested" ? (
        <>
          {disabledReason ? (
            <p className="mt-2 text-[0.75em] text-muted-foreground">{disabledReason}</p>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" disabled={disabled} onClick={onApprove}>Approve</Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={onReject}>Reject</Button>
          </div>
          {!disabled && onApprove ? (
            <p className="mt-2 text-[0.75em] text-muted-foreground">
              Press <Kbd className="mx-1 h-5 px-1.5 text-[0.75rem]">Enter</Kbd> to approve.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-muted-foreground">Decision: {state}</p>
      )}
    </div>
  );
}
