import { Gavel } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, toast } from "@/components/ui";
import { ProviderModelPicker } from "@/components/session/ProviderModelPicker";
import { getDefaultModelForProvider } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";

/**
 * Dialog for launching the Coliseum reviewer role.
 *
 * Isolated from the arena panel so: (a) the arena stays presentational with a
 * single "Review & compare" header button, (b) the picker state is reset on
 * close, and (c) the reviewer model choice is confined to one place. Uses the
 * same `ProviderModelPicker` the launcher dialog uses so reviewer + entrants
 * feel identical to pick.
 */

interface ColiseumReviewerDialogProps {
  parentTaskId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Default provider/model to seed. Usually inherits from the parent task. */
  defaultProvider?: ProviderId;
  defaultModel?: string;
  /** True when an existing verdict is being replaced (relabels the confirm). */
  isReRun?: boolean;
}

export function ColiseumReviewerDialog(props: ColiseumReviewerDialogProps) {
  const launchColiseumReviewer = useAppStore(
    (state) => state.launchColiseumReviewer,
  );
  const providerAvailability = useAppStore(
    (state) => state.providerAvailability,
  );

  const defaultProvider: ProviderId = props.defaultProvider ?? "claude-code";
  const defaultModel =
    props.defaultModel ??
    getDefaultModelForProvider({ providerId: defaultProvider });

  const [provider, setProvider] = useState<ProviderId>(defaultProvider);
  const [model, setModel] = useState<string>(defaultModel);
  const [submitting, setSubmitting] = useState(false);

  // Reset to defaults whenever the dialog opens so the next invocation starts
  // fresh and follows parent-task defaults if they changed.
  useEffect(() => {
    if (props.open) {
      setProvider(defaultProvider);
      setModel(defaultModel);
    }
  }, [props.open, defaultProvider, defaultModel]);

  const providerAvailable = providerAvailability[provider] !== false;
  const canSubmit = !submitting && providerAvailable;

  const confirmLabel = useMemo(() => {
    if (submitting) return props.isReRun ? "Re-running…" : "Starting…";
    return props.isReRun ? "Re-run review" : "Start review";
  }, [submitting, props.isReRun]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await launchColiseumReviewer({
        parentTaskId: props.parentTaskId,
        reviewerProvider: provider,
        reviewerModel: model,
      });
      if (result.status === "started") {
        toast.success("Reviewer is comparing the branches…");
        props.onOpenChange(false);
      } else {
        toast.error(result.reason);
      }
    } catch (error) {
      toast.error(
        `Failed to start reviewer: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (submitting) return;
        props.onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="size-4" />
            Review &amp; compare
          </DialogTitle>
          <DialogDescription>
            A reviewer model reads every branch&apos;s output and produces a
            structured verdict — TL;DR, per-branch scorecard, key differences,
            and red flags. Pick the reviewer provider and model below.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 rounded-md border border-border/70 bg-muted/30 p-2">
          <ProviderModelPicker
            selectedProvider={provider}
            selectedModel={model}
            onProviderChange={(next) => {
              setProvider(next);
              setModel(getDefaultModelForProvider({ providerId: next }));
            }}
            onModelChange={setModel}
            providerAvailable={providerAvailable}
          />
          {!providerAvailable ? (
            <div className="text-xs text-destructive">
              This provider is unavailable. Check provider status and retry.
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => props.onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
