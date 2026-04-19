import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Ellipsis, Plus, SquareTerminal } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import {
  getDefaultModelForProvider,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  generatePresetId,
  listModelsForPresetProvider,
  normalizeTaskPreset,
  type TaskPreset,
  type TaskPresetKind,
} from "@/lib/task-presets";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

type PresetEditorTarget =
  | { kind: "edit"; presetId: string }
  | { kind: "new" }
  | null;

/**
 * Horizontal quick-launch bar between the task tab strip and the chat panel.
 *
 * Each chip is a user-configurable `TaskPreset` that either creates a new
 * task seeded with a provider + model, or opens a native CLI session tab.
 * Presets are persisted in `AppSettings.taskPresets` so they survive across
 * sessions.
 */
export function PresetBar() {
  const [
    presets,
    applyTaskPreset,
    upsertTaskPreset,
    removeTaskPreset,
    resetTaskPresetsToDefault,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.taskPresets,
          state.applyTaskPreset,
          state.upsertTaskPreset,
          state.removeTaskPreset,
          state.resetTaskPresetsToDefault,
        ] as const,
    ),
  );

  const [editorTarget, setEditorTarget] = useState<PresetEditorTarget>(null);

  const handleApply = useCallback(
    (preset: TaskPreset) => {
      applyTaskPreset({ presetId: preset.id });
    },
    [applyTaskPreset],
  );

  const handleSavePreset = useCallback(
    (preset: TaskPreset) => {
      upsertTaskPreset({ preset });
      setEditorTarget(null);
    },
    [upsertTaskPreset],
  );

  const handleDeletePreset = useCallback(
    (presetId: string) => {
      removeTaskPreset({ presetId });
      setEditorTarget((current) =>
        current?.kind === "edit" && current.presetId === presetId
          ? null
          : current,
      );
    },
    [removeTaskPreset],
  );

  // Regenerate the draft id every time the "new" popover transitions open so
  // successive adds don't collide on the same id (`upsertTaskPreset` treats
  // the id as the upsert key).
  const isAddingNew = editorTarget?.kind === "new";
  const newPresetDraft = useMemo<TaskPreset>(
    () => ({
      id: generatePresetId(),
      label: "",
      kind: "task",
      provider: "claude-code",
      model: getDefaultModelForProvider({ providerId: "claude-code" }),
    }),
    [isAddingNew],
  );

  return (
    <div
      className={cn(
        "flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto",
        "border-b border-border/70 bg-muted/20 px-2 py-1",
      )}
      data-testid="preset-bar"
    >
      {presets.map((preset) => (
        <PresetChip
          key={preset.id}
          preset={preset}
          isEditing={
            editorTarget?.kind === "edit" &&
            editorTarget.presetId === preset.id
          }
          onApply={handleApply}
          onRequestEdit={() =>
            setEditorTarget({ kind: "edit", presetId: preset.id })
          }
          onCloseEditor={() => setEditorTarget(null)}
          onSave={handleSavePreset}
          onDelete={() => handleDeletePreset(preset.id)}
        />
      ))}

      <Popover
        open={editorTarget?.kind === "new"}
        onOpenChange={(open) =>
          setEditorTarget(open ? { kind: "new" } : null)
        }
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
            aria-label="Add preset"
          >
            <Plus className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <PresetEditor
            initialPreset={newPresetDraft}
            submitLabel="Add preset"
            onSave={handleSavePreset}
            onCancel={() => setEditorTarget(null)}
          />
        </PopoverContent>
      </Popover>

      {presets.length === 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => resetTaskPresetsToDefault()}
        >
          Restore default presets
        </Button>
      ) : null}
    </div>
  );
}

interface PresetChipProps {
  preset: TaskPreset;
  isEditing: boolean;
  onApply: (preset: TaskPreset) => void;
  onRequestEdit: () => void;
  onCloseEditor: () => void;
  onSave: (preset: TaskPreset) => void;
  onDelete: () => void;
}

function PresetChip(props: PresetChipProps) {
  const { preset, isEditing, onApply, onRequestEdit, onCloseEditor, onSave, onDelete } =
    props;

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (!open) {
          onCloseEditor();
        }
      }}
    >
      <PopoverAnchor asChild>
        <div
          className={cn(
            "group relative flex h-7 shrink-0 items-stretch rounded-md border border-border/60",
            "bg-card/70 text-foreground shadow-sm transition-colors hover:bg-card",
            "focus-within:ring-1 focus-within:ring-primary/40",
          )}
          data-preset-id={preset.id}
        >
          <button
            type="button"
            onClick={() => onApply(preset)}
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded-l-md px-2 text-xs",
              "outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
            )}
            title={buildChipTitle(preset)}
          >
            <ModelIcon
              providerId={preset.provider}
              model={preset.model}
              className="size-3.5 shrink-0"
            />
            <span className="truncate max-w-[140px]">{preset.label}</span>
            {preset.kind === "cli-session" ? (
              <SquareTerminal
                className="size-3 shrink-0 text-muted-foreground"
                aria-label="CLI session"
              />
            ) : null}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-full w-5 shrink-0 rounded-l-none rounded-r-md px-0 text-muted-foreground",
                  "opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100",
                  "data-[state=open]:opacity-100",
                )}
                aria-label="Preset actions"
              >
                <Ellipsis className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onSelect={() => onRequestEdit()}>
                Edit…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onDelete()}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-72">
        <PresetEditor
          initialPreset={preset}
          submitLabel="Save"
          onSave={onSave}
          onCancel={onCloseEditor}
        />
      </PopoverContent>
    </Popover>
  );
}

function buildChipTitle(preset: TaskPreset) {
  if (preset.kind === "cli-session") {
    return `${preset.label} — CLI session`;
  }
  if (preset.model) {
    return `${preset.label} — ${toHumanModelName({ model: preset.model })}`;
  }
  return preset.label;
}

interface PresetEditorProps {
  initialPreset: TaskPreset;
  submitLabel: string;
  onSave: (preset: TaskPreset) => void;
  onCancel: () => void;
}

function PresetEditor(props: PresetEditorProps) {
  const { initialPreset, submitLabel, onSave, onCancel } = props;
  const [kind, setKind] = useState<TaskPresetKind>(initialPreset.kind);
  const [provider, setProvider] = useState<ProviderId>(initialPreset.provider);
  const [model, setModel] = useState<string>(
    initialPreset.model ??
      getDefaultModelForProvider({ providerId: initialPreset.provider }),
  );
  const [label, setLabel] = useState<string>(initialPreset.label);

  const modelOptions = useMemo(
    () => listModelsForPresetProvider(provider),
    [provider],
  );
  const providerOptions = useMemo<{ value: ProviderId; label: string }[]>(() => {
    if (kind === "cli-session") {
      return [
        { value: "claude-code", label: "Claude" },
        { value: "codex", label: "Codex" },
      ];
    }
    return [
      { value: "claude-code", label: "Claude Code" },
      { value: "codex", label: "Codex" },
      { value: "stave", label: "Stave Auto" },
    ];
  }, [kind]);

  const handleKindChange = (nextKindValue: string) => {
    const nextKind: TaskPresetKind =
      nextKindValue === "cli-session" ? "cli-session" : "task";
    setKind(nextKind);
    if (nextKind === "cli-session" && provider === "stave") {
      const fallback: ProviderId = "claude-code";
      setProvider(fallback);
      setModel(getDefaultModelForProvider({ providerId: fallback }));
    }
  };

  const handleProviderChange = (nextProvider: string) => {
    const providerId =
      nextProvider === "claude-code" ||
      nextProvider === "codex" ||
      nextProvider === "stave"
        ? (nextProvider as ProviderId)
        : "claude-code";
    setProvider(providerId);
    const nextModels = listModelsForPresetProvider(providerId);
    if (!nextModels.includes(model)) {
      setModel(getDefaultModelForProvider({ providerId }));
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeTaskPreset({
      id: initialPreset.id,
      label,
      kind,
      provider,
      model,
    });
    onSave(normalized);
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="preset-editor-label"
          className="text-xs font-medium text-muted-foreground"
        >
          Label
        </label>
        <Input
          id="preset-editor-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Opus 4.7"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Type</span>
        <Select value={kind} onValueChange={handleKindChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="task">Task</SelectItem>
            <SelectItem value="cli-session">CLI session</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Provider
        </span>
        <Select value={provider} onValueChange={handleProviderChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providerOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {kind === "task" ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Model
          </span>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {toHumanModelName({ model: option })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
