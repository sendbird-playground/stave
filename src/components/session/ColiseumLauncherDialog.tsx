import { Plus, Swords, Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, Textarea, toast, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { ProviderModelPicker } from "@/components/session/ProviderModelPicker";
import {
  getDefaultModelForProvider,
  listProviderIds,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import {
  MAX_COLISEUM_BRANCHES,
  MIN_COLISEUM_BRANCHES,
  validateColiseumBranches,
  type ColiseumBranchSpec,
} from "@/store/coliseum.utils";

/**
 * Coliseum launcher dialog.
 *
 * Why a standalone dialog rather than inline in ChatInput: the composer is
 * already a dense multi-concern component (1800+ LOC) and the Coliseum is an
 * intentionally opt-in, low-frequency action. A dialog keeps the happy path
 * (single-model chat) visually clean, and isolates the fan-out flow so it
 * cannot regress existing behaviour.
 */

interface ColiseumLauncherDialogProps {
  parentTaskId: string;
  defaultProviderId?: ProviderId;
  defaultModel?: string;
  disabled?: boolean;
  disabledReason?: string;
  renderTrigger?: (args: { disabled: boolean }) => ReactNode;
  tooltipSide?: "top" | "right" | "bottom" | "left";
}

interface BranchDraft {
  id: string;
  provider: ProviderId;
  model: string;
}

function makeDefaultBranches(args: {
  defaultProviderId?: ProviderId;
  defaultModel?: string;
}): BranchDraft[] {
  const primaryProvider: ProviderId = args.defaultProviderId ?? "claude-code";
  const primaryModel =
    args.defaultModel ?? getDefaultModelForProvider({ providerId: primaryProvider });
  // Pick a distinct second entrant so the contest actually compares something.
  const secondaryProvider: ProviderId =
    primaryProvider === "codex" ? "claude-code" : "codex";
  const secondaryModel = getDefaultModelForProvider({
    providerId: secondaryProvider,
  });
  return [
    { id: crypto.randomUUID(), provider: primaryProvider, model: primaryModel },
    {
      id: crypto.randomUUID(),
      provider: secondaryProvider,
      model: secondaryModel,
    },
  ];
}

export function ColiseumLauncherDialog(args: ColiseumLauncherDialogProps) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<BranchDraft[]>(() =>
    makeDefaultBranches({
      defaultProviderId: args.defaultProviderId,
      defaultModel: args.defaultModel,
    }),
  );
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const startColiseum = useAppStore((state) => state.startColiseum);
  const providerAvailability = useAppStore(
    (state) => state.providerAvailability,
  );

  const providerIds = useMemo(() => listProviderIds(), []);

  const branchSpecs = useMemo<ColiseumBranchSpec[]>(
    () =>
      branches.map((branch) => ({
        provider: branch.provider,
        model: branch.model,
      })),
    [branches],
  );

  const validationError = useMemo(
    () => validateColiseumBranches(branchSpecs),
    [branchSpecs],
  );
  const hasUnavailableProvider = branches.some(
    (branch) => providerAvailability[branch.provider] === false,
  );
  const promptTrimmed = prompt.trim();
  const canSubmit =
    !submitting &&
    validationError == null &&
    !hasUnavailableProvider &&
    promptTrimmed.length > 0;

  const resetToDefaults = () => {
    setBranches(
      makeDefaultBranches({
        defaultProviderId: args.defaultProviderId,
        defaultModel: args.defaultModel,
      }),
    );
    setPrompt("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (submitting) {
      return;
    }
    setOpen(nextOpen);
    if (!nextOpen) {
      // Reset on close so the next open starts fresh.
      resetToDefaults();
    }
  };

  const addBranch = () => {
    if (branches.length >= MAX_COLISEUM_BRANCHES) return;
    // Seed the new row with a provider that is not already at capacity, or fall
    // back to the first available provider. Keeps duplicate picks possible (the
    // user may want to compare two temperatures of the same model later).
    const usedProviderIds = new Set(branches.map((branch) => branch.provider));
    const nextProvider =
      providerIds.find((id) => !usedProviderIds.has(id)) ?? providerIds[0];
    if (!nextProvider) return;
    setBranches([
      ...branches,
      {
        id: crypto.randomUUID(),
        provider: nextProvider,
        model: getDefaultModelForProvider({ providerId: nextProvider }),
      },
    ]);
  };

  const removeBranch = (branchId: string) => {
    if (branches.length <= MIN_COLISEUM_BRANCHES) return;
    setBranches(branches.filter((branch) => branch.id !== branchId));
  };

  const updateBranchProvider = (branchId: string, provider: ProviderId) => {
    setBranches(
      branches.map((branch) =>
        branch.id === branchId
          ? {
              ...branch,
              provider,
              model: getDefaultModelForProvider({ providerId: provider }),
            }
          : branch,
      ),
    );
  };

  const updateBranchModel = (branchId: string, model: string) => {
    setBranches(
      branches.map((branch) =>
        branch.id === branchId ? { ...branch, model } : branch,
      ),
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await startColiseum({
        parentTaskId: args.parentTaskId,
        branches: branchSpecs,
        content: promptTrimmed,
      });
      if (result.status === "started") {
        toast.success(
          `Coliseum started — ${result.branchTaskIds.length} branches running`,
        );
        setOpen(false);
        resetToDefaults();
      } else {
        toast.error(`Could not start Coliseum: ${result.reason}`);
      }
    } catch (error) {
      toast.error(
        `Failed to start Coliseum: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const triggerDisabled = args.disabled === true;
  const triggerElement = args.renderTrigger?.({ disabled: triggerDisabled }) ?? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1.5 text-xs"
      disabled={triggerDisabled}
    >
      <Swords className="size-3.5" />
      <span>Coliseum</span>
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <DialogTrigger asChild disabled={triggerDisabled}>
                {triggerElement}
              </DialogTrigger>
            </span>
          </TooltipTrigger>
          <TooltipContent
            side={args.tooltipSide ?? "bottom"}
            className="max-w-xs text-xs"
          >
            {triggerDisabled
              ? (args.disabledReason ??
                "Coliseum is unavailable for this task right now.")
              : "Run the same prompt across 2–4 models in parallel and pick the winner."}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Swords className="size-4" />
            Coliseum
          </DialogTitle>
          <DialogDescription>
            Pick {MIN_COLISEUM_BRANCHES}–{MAX_COLISEUM_BRANCHES} entrants. Each
            runs the same prompt in parallel; you promote one response as the
            canonical answer and the rest are discarded.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {branches.map((branch, index) => {
            const providerAvailable =
              providerAvailability[branch.provider] !== false;
            return (
              <div
                key={branch.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-2",
                  !providerAvailable && "border-destructive/60",
                )}
              >
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted-foreground">
                  {index + 1}
                </span>

                <div className="flex flex-1 items-center gap-2">
                  <ProviderModelPicker
                    selectedProvider={branch.provider}
                    selectedModel={branch.model}
                    onProviderChange={(providerId) =>
                      updateBranchProvider(branch.id, providerId)
                    }
                    onModelChange={(model) =>
                      updateBranchModel(branch.id, model)
                    }
                    providerAvailable={providerAvailable}
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove entrant ${index + 1}`}
                  disabled={branches.length <= MIN_COLISEUM_BRANCHES}
                  onClick={() => removeBranch(branch.id)}
                  className="shrink-0"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addBranch}
            disabled={branches.length >= MAX_COLISEUM_BRANCHES}
            className="self-start gap-1.5 text-xs"
          >
            <Plus className="size-3.5" />
            Add entrant ({branches.length}/{MAX_COLISEUM_BRANCHES})
          </Button>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="coliseum-prompt"
              className="text-xs font-medium text-muted-foreground"
            >
              Prompt
            </label>
            <Textarea
              id="coliseum-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Type the prompt every entrant should run..."
              rows={5}
              className="resize-none text-sm"
              disabled={submitting}
            />
          </div>

          {validationError || hasUnavailableProvider ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {hasUnavailableProvider
                ? "One or more selected providers are unavailable. Check provider status and retry."
                : validationError}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
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
            {submitting ? "Starting…" : "Start Coliseum"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
