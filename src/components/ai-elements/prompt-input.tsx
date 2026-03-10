import { FilePlus2, LoaderCircle, Square } from "lucide-react";
import { type FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Command, CommandEmpty, CommandGroup, CommandItem, CommandList, Popover, PopoverAnchor, PopoverContent, Input, Textarea } from "@/components/ui";
import type { CommandPaletteItem, CommandPaletteProviderNote } from "@/lib/commands";
import { filterCommandPaletteItems, getSlashCommandSearchQuery } from "@/lib/commands";
import { cn } from "@/lib/utils";
import { getAcceptedCommandPaletteItem, getNextCommandSelectionIndex, NO_COMMAND_SELECTION } from "./prompt-input.utils";
import { ModelSelector, type ModelSelectorOption } from "./model-selector";
import { PermissionModeSelector, cyclePermissionMode, type PermissionModeValue } from "./permission-mode-selector";

interface PromptInputProps {
  value: string;
  disabled?: boolean;
  isTurnActive?: boolean;
  focusToken?: string;
  selectedModel: ModelSelectorOption;
  modelOptions: readonly ModelSelectorOption[];
  projectFiles: string[];
  attachedFilePath?: string;
  permissionMode?: PermissionModeValue;
  commandPaletteItems?: CommandPaletteItem[];
  commandPaletteProviderNote?: CommandPaletteProviderNote;
  onValueChange: (value: string) => void;
  onModelSelect: (args: { selection: ModelSelectorOption }) => void;
  onAttachFileChange: (args: { filePath: string }) => void;
  onPermissionModeChange?: (value: PermissionModeValue) => void;
  onSubmit: (args: { text: string; filePath?: string }) => void | Promise<void>;
  onAbort?: () => void;
}

export function PromptInput(args: PromptInputProps) {
  const {
    disabled,
    isTurnActive,
    focusToken,
    value,
    selectedModel,
    modelOptions,
    projectFiles,
    attachedFilePath,
    permissionMode,
    commandPaletteItems,
    commandPaletteProviderNote,
    onValueChange,
    onModelSelect,
    onAttachFileChange,
    onPermissionModeChange,
    onSubmit,
    onAbort,
  } = args;
  const [attachOpen, setAttachOpen] = useState(false);
  const [fileFilter, setFileFilter] = useState("");
  const [dismissedCommandQuery, setDismissedCommandQuery] = useState<string | null>(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(NO_COMMAND_SELECTION);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wasTurnActiveRef = useRef(Boolean(isTurnActive));
  const interactionsDisabled = Boolean(disabled || isTurnActive);
  const maxTextareaHeight = 240;
  const commandQuery = useMemo(() => getSlashCommandSearchQuery(value), [value]);
  const filteredCommandItems = useMemo(() => filterCommandPaletteItems({
    items: commandPaletteItems ?? [],
    query: commandQuery,
  }), [commandPaletteItems, commandQuery]);
  const indexedCommandItems = useMemo(
    () => filteredCommandItems.map((item, index) => ({ item, index })),
    [filteredCommandItems]
  );
  const staveCommandItems = useMemo(
    () => indexedCommandItems.filter(({ item }) => item.source !== "provider_native"),
    [indexedCommandItems]
  );
  const providerCommandItems = useMemo(
    () => indexedCommandItems.filter(({ item }) => item.source === "provider_native"),
    [indexedCommandItems]
  );
  const commandPaletteOpen = Boolean(
    commandQuery
    && dismissedCommandQuery !== commandQuery
    && (filteredCommandItems.length > 0 || commandPaletteProviderNote)
  );

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, maxTextareaHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxTextareaHeight ? "auto" : "hidden";
  }, [value, maxTextareaHeight]);

  useEffect(() => {
    if (interactionsDisabled) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [focusToken, interactionsDisabled]);

  useEffect(() => {
    const wasTurnActive = wasTurnActiveRef.current;
    const isTurnNowActive = Boolean(isTurnActive);
    if (wasTurnActive && !isTurnNowActive) {
      textareaRef.current?.focus();
    }
    wasTurnActiveRef.current = isTurnNowActive;
  }, [isTurnActive]);

  useEffect(() => {
    if (dismissedCommandQuery && commandQuery !== dismissedCommandQuery) {
      setDismissedCommandQuery(null);
    }
  }, [commandQuery, dismissedCommandQuery]);

  useEffect(() => {
    setSelectedCommandIndex(NO_COMMAND_SELECTION);
  }, [commandQuery]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      setSelectedCommandIndex(NO_COMMAND_SELECTION);
      return;
    }
    setSelectedCommandIndex((current) => {
      if (current === NO_COMMAND_SELECTION) {
        return NO_COMMAND_SELECTION;
      }
      return Math.min(current, Math.max(filteredCommandItems.length - 1, 0));
    });
  }, [commandPaletteOpen, filteredCommandItems.length]);

  const filteredFiles = useMemo(() => {
    const normalized = fileFilter.trim().toLowerCase();
    if (!normalized) {
      return projectFiles.slice(0, 120);
    }
    return projectFiles.filter((path) => path.toLowerCase().includes(normalized)).slice(0, 120);
  }, [fileFilter, projectFiles]);

  async function submitCurrentMessage() {
    const nextText = value.trim();
    if (!nextText && !attachedFilePath) {
      return;
    }
    await onSubmit({ text: nextText, filePath: attachedFilePath });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitCurrentMessage();
  }

  function applyCommandSelection(item: CommandPaletteItem) {
    const leadingWhitespace = value.match(/^\s*/)?.[0] ?? "";
    onValueChange(`${leadingWhitespace}${item.insertText}`);
    setDismissedCommandQuery(null);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  return (
    <form data-prompt-input-root onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border/80 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ModelSelector
          value={selectedModel}
          options={modelOptions}
          disabled={interactionsDisabled}
          onSelect={({ selection }) => onModelSelect({ selection })}
        />
        {permissionMode !== undefined && onPermissionModeChange ? (
          <PermissionModeSelector
            providerId={selectedModel.providerId}
            value={permissionMode}
            disabled={interactionsDisabled}
            onSelect={onPermissionModeChange}
          />
        ) : null}
      </div>
      <Popover open={commandPaletteOpen} modal={false}>
        <PopoverAnchor asChild>
          <div>
            <Textarea
              ref={textareaRef}
              value={value}
              disabled={interactionsDisabled}
              onChange={(event) => {
                onValueChange(event.target.value);
              }}
              onKeyDown={(event) => {
                if (commandPaletteOpen && filteredCommandItems.length > 0 && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSelectedCommandIndex((current) => getNextCommandSelectionIndex({
                      currentIndex: current,
                      itemCount: filteredCommandItems.length,
                      direction: "next",
                    }));
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSelectedCommandIndex((current) => getNextCommandSelectionIndex({
                      currentIndex: current,
                      itemCount: filteredCommandItems.length,
                      direction: "previous",
                    }));
                    return;
                  }
                  if (event.key === "Enter" || event.key === "Tab") {
                    if (event.nativeEvent.isComposing) {
                      return;
                    }
                    const selectedItem = getAcceptedCommandPaletteItem({
                      items: filteredCommandItems,
                      selectedIndex: selectedCommandIndex,
                      triggerKey: event.key,
                    });
                    if (selectedItem) {
                      event.preventDefault();
                      applyCommandSelection(selectedItem);
                      return;
                    }
                  }
                }
                if (commandPaletteOpen && event.key === "Escape") {
                  event.preventDefault();
                  setDismissedCommandQuery(commandQuery);
                  return;
                }
                if (event.key === "Tab" && event.shiftKey && permissionMode && onPermissionModeChange) {
                  event.preventDefault();
                  onPermissionModeChange(cyclePermissionMode({ providerId: selectedModel.providerId, current: permissionMode }));
                  return;
                }
                if (event.key !== "Enter") {
                  return;
                }
                if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
                  return;
                }
                if (event.nativeEvent.isComposing) {
                  return;
                }
                event.preventDefault();
                void submitCurrentMessage();
              }}
              placeholder="Use / for provider commands, /stave: for local commands, @ to search files (Enter to send)"
              className="min-h-[104px] max-h-[240px] resize-none overflow-y-auto rounded-lg border-border/70 bg-background text-lg leading-8 md:text-lg"
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={() => setDismissedCommandQuery(commandQuery)}
          className="w-[min(34rem,calc(100vw-2rem))] gap-0 rounded-xl border border-border/80 bg-popover p-1 shadow-lg"
        >
          <Command shouldFilter={false} className="rounded-lg border border-border/60 bg-background/70 p-0">
            <CommandList className="max-h-72">
              {filteredCommandItems.length === 0 ? (
                <CommandEmpty>No matching slash command.</CommandEmpty>
              ) : (
                <>
                  {staveCommandItems.length > 0 ? (
                    <CommandGroup heading="Stave commands">
                      {staveCommandItems.map(({ item, index }) => (
                        <CommandItem
                          key={item.id}
                          value={item.command}
                          data-selected={index === selectedCommandIndex ? "" : undefined}
                          className={cn(
                            "items-start gap-3 rounded-md px-3 py-2",
                            index === selectedCommandIndex && "bg-muted text-foreground"
                          )}
                          onMouseEnter={() => setSelectedCommandIndex(index)}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applyCommandSelection(item);
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.command}</span>
                              <Badge variant={item.source === "stave_builtin" ? "secondary" : "outline"} className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                                {item.source === "stave_builtin" ? "Stave" : "Custom"}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                  {providerCommandItems.length > 0 ? (
                    <CommandGroup heading={selectedModel.providerId === "claude-code" ? "Claude native commands" : "Provider commands"}>
                      {providerCommandItems.map(({ item, index }) => (
                        <CommandItem
                          key={item.id}
                          value={item.command}
                          data-selected={index === selectedCommandIndex ? "" : undefined}
                          className={cn(
                            "items-start gap-3 rounded-md px-3 py-2",
                            index === selectedCommandIndex && "bg-muted text-foreground"
                          )}
                          onMouseEnter={() => setSelectedCommandIndex(index)}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applyCommandSelection(item);
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.command}</span>
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                                {selectedModel.providerId === "claude-code" ? "Claude" : "Provider"}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                </>
              )}
            </CommandList>
            {commandPaletteOpen ? (
              <div className="border-t border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Tab inserts highlighted command. Enter sends the current prompt.</p>
                {commandPaletteProviderNote ? (
                  <>
                    <p className="mt-2 font-medium text-foreground">{commandPaletteProviderNote.title}</p>
                    <p className="mt-1 whitespace-pre-line">{commandPaletteProviderNote.description}</p>
                  </>
                ) : null}
              </div>
            ) : null}
          </Command>
        </PopoverContent>
      </Popover>
      {attachedFilePath ? (
        <div className="rounded-sm border border-border/80 bg-secondary/50 px-2 py-1.5 text-sm">
          Attached file: <span className="font-medium">{attachedFilePath}</span>
        </div>
      ) : null}
      {attachOpen ? (
        <div className="animate-dropdown-in rounded-sm border border-border/80 bg-popover p-2">
          <Input
            value={fileFilter}
            disabled={interactionsDisabled}
            onChange={(event) => setFileFilter(event.target.value)}
            placeholder="Find file to attach"
            className="h-9 rounded-md border-border/80 bg-background px-3 text-sm"
          />
          <div className="mt-2 max-h-40 space-y-1 overflow-auto">
            {filteredFiles.map((filePath) => (
              <button
                type="button"
                key={filePath}
                disabled={interactionsDisabled}
                onClick={() => {
                  onAttachFileChange({ filePath });
                  setAttachOpen(false);
                }}
                className={cn(
                  "w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary/70",
                  filePath === attachedFilePath && "bg-secondary/80",
                )}
              >
                {filePath}
              </button>
            ))}
            {filteredFiles.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">No matching files.</p> : null}
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAttachOpen((prev) => !prev)}
            disabled={interactionsDisabled}
            className={cn(
              "h-9 w-9 rounded-md border border-border/70 bg-secondary p-0 text-muted-foreground hover:bg-secondary/60",
              attachOpen && "bg-secondary/90 text-foreground",
            )}
          >
            <FilePlus2 className="size-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {isTurnActive ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 rounded-md px-3.5 text-sm"
              onClick={() => onAbort?.()}
            >
              <Square className="size-3.5" />
              Abort
            </Button>
          ) : null}
          <Button type="submit" size="sm" className="h-9 rounded-md px-3.5 text-sm" disabled={interactionsDisabled}>
            {isTurnActive ? (
              <>
                <LoaderCircle className="size-3.5 animate-spin" />
                Responding...
              </>
            ) : "Send"}
          </Button>
        </div>
      </div>
    </form>
  );
}
