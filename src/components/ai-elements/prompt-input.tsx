import { Brain, Camera, Check, ClipboardCheck, FilePlus2, FolderOpen, Globe2, OctagonX, Plus, Send, SlidersHorizontal, Sparkles, UserRound, X, Zap } from "lucide-react";
import type { Attachment, UserInputPart } from "@/types/chat";
import { type FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Command, CommandEmpty, CommandGroup, CommandItem, CommandList, Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Input, Kbd, KbdGroup, Popover, PopoverAnchor, PopoverContent, Textarea, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { UserInputCard } from "./user-input-card";
import type { CommandPaletteItem, CommandPaletteProviderNote } from "@/lib/commands";
import { filterCommandPaletteItems, getSlashCommandSearchQuery } from "@/lib/commands";
import { getActiveSkillTokenMatch, replaceSkillToken } from "@/lib/skills/catalog";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import { cn } from "@/lib/utils";
import { getAcceptedCommandPaletteItem, getAcceptedPaletteItem, getNextCommandSelectionIndex, NO_COMMAND_SELECTION } from "./prompt-input.utils";
import { ModelSelector, type ModelSelectorOption } from "./model-selector";
import { PromptInputRuntimeBar, type PromptInputRuntimeControl, type PromptInputRuntimeStatusItem } from "./prompt-input-runtime-bar";
import { PermissionModeSelector, cyclePermissionMode, type PermissionModeValue } from "./permission-mode-selector";

interface PromptInputProps {
  value: string;
  disabled?: boolean;
  isTurnActive?: boolean;
  focusToken?: string;
  selectedModel: ModelSelectorOption;
  modelOptions: readonly ModelSelectorOption[];
  projectFiles: string[];
  attachedFilePaths: string[];
  attachments?: Attachment[];
  permissionMode?: PermissionModeValue;
  runtimeQuickControls?: readonly PromptInputRuntimeControl[];
  runtimeStatusItems?: readonly PromptInputRuntimeStatusItem[];
  commandPaletteItems?: readonly CommandPaletteItem[];
  commandPaletteProviderNote?: CommandPaletteProviderNote;
  skillsEnabled?: boolean;
  skillsAutoSuggest?: boolean;
  skillPaletteItems?: readonly SkillCatalogEntry[];
  onValueChange: (value: string) => void;
  onModelSelect: (args: { selection: ModelSelectorOption }) => void;
  onAttachFilesChange: (args: { filePaths: string[] }) => void;
  onAttachmentsChange?: (args: { attachments: Attachment[] }) => void;
  onCaptureScreenshot?: () => void;
  onPermissionModeChange?: (value: PermissionModeValue) => void;
  fastMode?: boolean;
  onFastModeChange?: (enabled: boolean) => void;
  planMode?: boolean;
  onPlanModeChange?: (enabled: boolean) => void;
  thinkingMode?: "adaptive" | "enabled" | "disabled";
  onThinkingModeChange?: (value: "adaptive" | "enabled" | "disabled") => void;
  pendingUserInput?: { messageId: string; part: UserInputPart } | null;
  onUserInputSubmit?: (args: { messageId: string; answers: Record<string, string> }) => void;
  onUserInputDeny?: (args: { messageId: string }) => void;
  onSubmit: (args: { text: string; filePaths: string[] }) => void | Promise<void>;
  onAbort?: () => void;
}

const SUPPORTS_FIELD_SIZING_CONTENT = typeof CSS !== "undefined"
  && typeof CSS.supports === "function"
  && CSS.supports("field-sizing", "content");

export function PromptInput(args: PromptInputProps) {
  const {
    disabled,
    isTurnActive,
    focusToken,
    value,
    selectedModel,
    modelOptions,
    projectFiles,
    attachedFilePaths,
    attachments,
    permissionMode,
    runtimeQuickControls,
    runtimeStatusItems,
    commandPaletteItems,
    commandPaletteProviderNote,
    skillsEnabled,
    skillsAutoSuggest,
    skillPaletteItems,
    onValueChange,
    onModelSelect,
    onAttachFilesChange,
    onAttachmentsChange,
    onCaptureScreenshot,
    onPermissionModeChange,
    fastMode,
    onFastModeChange,
    planMode,
    onPlanModeChange,
    thinkingMode,
    onThinkingModeChange,
    pendingUserInput,
    onUserInputSubmit,
    onUserInputDeny,
    onSubmit,
    onAbort,
  } = args;
  const imageAttachments = useMemo(
    () => (attachments ?? []).filter((a): a is Extract<Attachment, { kind: "image" }> => a.kind === "image"),
    [attachments],
  );
  const screenshotAvailable = Boolean(onCaptureScreenshot);
  const [imagePreviewSrc, setImagePreviewSrc] = useState<{ dataUrl: string; label: string } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [fileFilter, setFileFilter] = useState("");
  const [dismissedCommandQuery, setDismissedCommandQuery] = useState<string | null>(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(NO_COMMAND_SELECTION);
  const [dismissedSkillToken, setDismissedSkillToken] = useState<string | null>(null);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(NO_COMMAND_SELECTION);
  const [caretIndex, setCaretIndex] = useState(value.length);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaAutosizeFrameRef = useRef<number | null>(null);
  const commandListRef = useRef<HTMLDivElement | null>(null);
  const wasTurnActiveRef = useRef(Boolean(isTurnActive));
  const interactionsDisabled = Boolean(disabled || isTurnActive);
  const maxTextareaHeight = 240;
  const commandQuery = useMemo(() => getSlashCommandSearchQuery(value), [value]);
  const deferredCommandQuery = useDeferredValue(commandQuery);
  const activeSkillToken = useMemo(() => (
    skillsEnabled
      ? getActiveSkillTokenMatch({
          value,
          caretIndex,
        })
      : null
  ), [caretIndex, skillsEnabled, value]);
  const deferredSkillQuery = useDeferredValue(activeSkillToken?.query ?? "");
  const deferredFileFilter = useDeferredValue(fileFilter);
  const filteredCommandItems = useMemo(() => filterCommandPaletteItems({
    items: commandPaletteItems ?? [],
    query: deferredCommandQuery,
  }), [commandPaletteItems, deferredCommandQuery]);
  const filteredSkillItems = useMemo(() => {
    const query = deferredSkillQuery.trim().toLowerCase();
    const items = skillPaletteItems ?? [];
    if (!query) {
      return items;
    }
    return items.filter((skill) => {
      const haystacks = [
        skill.slug,
        skill.name,
        skill.description,
        skill.scope,
        skill.provider,
      ];
      return haystacks.some((entry) => entry.toLowerCase().includes(query));
    });
  }, [deferredSkillQuery, skillPaletteItems]);
  const indexedCommandItems = useMemo(
    () => filteredCommandItems.map((item, index) => ({ item, index })),
    [filteredCommandItems]
  );
  const indexedSkillItems = useMemo(
    () => filteredSkillItems.map((item, index) => ({ item, index })),
    [filteredSkillItems]
  );
  const staveCommandItems = useMemo(
    () => indexedCommandItems.filter(({ item }) => item.source !== "provider_native"),
    [indexedCommandItems]
  );
  const providerCommandItems = useMemo(
    () => indexedCommandItems.filter(({ item }) => item.source === "provider_native"),
    [indexedCommandItems]
  );
  const localSkillItems = useMemo(
    () => indexedSkillItems.filter(({ item }) => item.scope === "local"),
    [indexedSkillItems]
  );
  const userSkillItems = useMemo(
    () => indexedSkillItems.filter(({ item }) => item.scope === "user"),
    [indexedSkillItems]
  );
  const globalSkillItems = useMemo(
    () => indexedSkillItems.filter(({ item }) => item.scope === "global"),
    [indexedSkillItems]
  );
  const commandPaletteOpen = Boolean(
    commandQuery
    && dismissedCommandQuery !== commandQuery
    && (filteredCommandItems.length > 0 || commandPaletteProviderNote)
  );
  const skillPaletteOpen = Boolean(
    skillsEnabled
    && skillsAutoSuggest
    && activeSkillToken
    && dismissedSkillToken !== activeSkillToken.token
  );
  const activePalette = skillPaletteOpen ? "skill" : commandPaletteOpen ? "command" : null;
  const hasRuntimePermissionControl = Boolean(runtimeQuickControls?.some((control) => control.id === "permission-mode"));
  const showStandalonePermissionSelector = Boolean(
    permissionMode !== undefined && onPermissionModeChange && !hasRuntimePermissionControl
  );
  const paletteValue = useMemo(() => {
    if (activePalette === "skill" && selectedSkillIndex !== NO_COMMAND_SELECTION) {
      return filteredSkillItems[selectedSkillIndex]?.slug ?? "";
    }
    if (activePalette === "command" && selectedCommandIndex !== NO_COMMAND_SELECTION) {
      return filteredCommandItems[selectedCommandIndex]?.command ?? "";
    }
    return "";
  }, [activePalette, selectedSkillIndex, selectedCommandIndex, filteredSkillItems, filteredCommandItems]);
  const hasControlsDrawerContent = Boolean(
    showStandalonePermissionSelector
    || (runtimeQuickControls?.length ?? 0) > 0
    || (runtimeStatusItems?.length ?? 0) > 0
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    if (SUPPORTS_FIELD_SIZING_CONTENT) {
      textarea.style.height = "";
      textarea.style.overflowY = "auto";
      return;
    }
    const measureHeight = () => {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const nextHeight = Math.min(scrollHeight, maxTextareaHeight);
      const nextOverflowY = scrollHeight > maxTextareaHeight ? "auto" : "hidden";
      if (textarea.style.height !== `${nextHeight}px`) {
        textarea.style.height = `${nextHeight}px`;
      }
      if (textarea.style.overflowY !== nextOverflowY) {
        textarea.style.overflowY = nextOverflowY;
      }
      textareaAutosizeFrameRef.current = null;
    };
    textareaAutosizeFrameRef.current = window.requestAnimationFrame(measureHeight);
    return () => {
      if (textareaAutosizeFrameRef.current !== null) {
        window.cancelAnimationFrame(textareaAutosizeFrameRef.current);
        textareaAutosizeFrameRef.current = null;
      }
    };
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
    if (dismissedSkillToken && activeSkillToken?.token !== dismissedSkillToken) {
      setDismissedSkillToken(null);
    }
  }, [activeSkillToken?.token, dismissedSkillToken]);

  useEffect(() => {
    setSelectedCommandIndex(NO_COMMAND_SELECTION);
  }, [commandQuery]);

  useEffect(() => {
    setSelectedSkillIndex(NO_COMMAND_SELECTION);
  }, [activeSkillToken?.token]);

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

  useEffect(() => {
    if (!skillPaletteOpen) {
      setSelectedSkillIndex(NO_COMMAND_SELECTION);
      return;
    }
    setSelectedSkillIndex((current) => {
      if (current === NO_COMMAND_SELECTION) {
        return NO_COMMAND_SELECTION;
      }
      return Math.min(current, Math.max(filteredSkillItems.length - 1, 0));
    });
  }, [filteredSkillItems.length, skillPaletteOpen]);

  useEffect(() => {
    if (selectedCommandIndex === NO_COMMAND_SELECTION) {
      return;
    }
    const list = commandListRef.current;
    if (!list) {
      return;
    }
    const selected = list.querySelector('[data-selected=""]');
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedCommandIndex]);

  useEffect(() => {
    if (selectedSkillIndex === NO_COMMAND_SELECTION) {
      return;
    }
    const list = commandListRef.current;
    if (!list) {
      return;
    }
    const selected = list.querySelector('[data-selected=""]');
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedSkillIndex]);

  const filteredFiles = useMemo(() => {
    if (!attachOpen) {
      return [];
    }
    const normalized = deferredFileFilter.trim().toLowerCase();
    if (!normalized) {
      return projectFiles.slice(0, 120);
    }
    return projectFiles.filter((path) => path.toLowerCase().includes(normalized)).slice(0, 120);
  }, [attachOpen, deferredFileFilter, projectFiles]);

  async function submitCurrentMessage() {
    const nextText = value.trim();
    if (!nextText && attachedFilePaths.length === 0) {
      return;
    }
    await onSubmit({ text: nextText, filePaths: attachedFilePaths });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitCurrentMessage();
  }

  function syncCaretPosition(nextTarget: HTMLTextAreaElement | null) {
    setCaretIndex(nextTarget?.selectionStart ?? 0);
  }

  function applyCommandSelection(item: CommandPaletteItem) {
    const leadingWhitespace = value.match(/^\s*/)?.[0] ?? "";
    onValueChange(`${leadingWhitespace}${item.insertText}`);
    setDismissedCommandQuery(null);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  function applySkillSelection(item: SkillCatalogEntry) {
    if (!activeSkillToken) {
      return;
    }
    const nextValue = replaceSkillToken({
      value,
      match: activeSkillToken,
      skill: item,
    });
    const nextCaretIndex = activeSkillToken.start + item.slug.length + 2;
    onValueChange(nextValue);
    setDismissedSkillToken(null);
    setCaretIndex(nextCaretIndex);
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(nextCaretIndex, nextCaretIndex);
    });
  }

  function renderSkillScopeIcon(scope: SkillCatalogEntry["scope"]) {
    if (scope === "local") {
      return <FolderOpen className="size-3.5 text-foreground/80" />;
    }
    if (scope === "user") {
      return <UserRound className="size-3.5 text-foreground/80" />;
    }
    return <Globe2 className="size-3.5 text-foreground/80" />;
  }

  if (pendingUserInput && onUserInputSubmit && onUserInputDeny) {
    return (
      <div className="space-y-3 rounded-xl border border-primary/40 bg-card p-4">
        <UserInputCard
          toolName={pendingUserInput.part.toolName}
          questions={pendingUserInput.part.questions}
          state={pendingUserInput.part.state}
          onSubmit={(answers) => onUserInputSubmit({ messageId: pendingUserInput.messageId, answers })}
          onDeny={() => onUserInputDeny({ messageId: pendingUserInput.messageId })}
        />
      </div>
    );
  }

  return (
    <>
    <form data-prompt-input-root onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border/80 bg-card p-4">
      <Popover open={activePalette !== null} modal={false}>
        <PopoverAnchor asChild>
          <div>
            <Textarea
              ref={textareaRef}
              value={value}
              disabled={interactionsDisabled}
              onChange={(event) => {
                syncCaretPosition(event.target);
                onValueChange(event.target.value);
              }}
              onClick={(event) => syncCaretPosition(event.currentTarget)}
              onKeyUp={(event) => syncCaretPosition(event.currentTarget)}
              onSelect={(event) => syncCaretPosition(event.currentTarget)}
              onPaste={(event) => {
                const items = event.clipboardData?.items;
                if (!items || !onAttachmentsChange) {
                  return;
                }
                const imageFiles: File[] = [];
                for (const item of items) {
                  if (item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) {
                      imageFiles.push(file);
                    }
                  }
                }
                if (imageFiles.length === 0) {
                  return;
                }
                event.preventDefault();
                Promise.all(
                  imageFiles.map(
                    (file) =>
                      new Promise<Extract<Attachment, { kind: "image" }>>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                          resolve({
                            kind: "image",
                            id: crypto.randomUUID(),
                            dataUrl: reader.result as string,
                            label: file.name || "Pasted image",
                          });
                        };
                        reader.readAsDataURL(file);
                      }),
                  ),
                ).then((newImages) => {
                  onAttachmentsChange({
                    attachments: [...(attachments ?? []), ...newImages],
                  });
                });
              }}
              onKeyDown={(event) => {
                if (activePalette === "skill" && filteredSkillItems.length > 0 && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSelectedSkillIndex((current) => getNextCommandSelectionIndex({
                      currentIndex: current,
                      itemCount: filteredSkillItems.length,
                      direction: "next",
                    }));
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSelectedSkillIndex((current) => getNextCommandSelectionIndex({
                      currentIndex: current,
                      itemCount: filteredSkillItems.length,
                      direction: "previous",
                    }));
                    return;
                  }
                  if (event.key === "Enter" || event.key === "Tab") {
                    if (event.nativeEvent.isComposing) {
                      return;
                    }
                    const selectedItem = getAcceptedPaletteItem({
                      items: filteredSkillItems,
                      selectedIndex: selectedSkillIndex,
                      triggerKey: event.key,
                    });
                    if (selectedItem) {
                      event.preventDefault();
                      applySkillSelection(selectedItem);
                      return;
                    }
                  }
                }
                if (activePalette === "command" && filteredCommandItems.length > 0 && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
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
                if (activePalette === "skill" && event.key === "Escape") {
                  event.preventDefault();
                  setDismissedSkillToken(activeSkillToken?.token ?? null);
                  return;
                }
                if (activePalette === "command" && event.key === "Escape") {
                  event.preventDefault();
                  setDismissedCommandQuery(commandQuery);
                  return;
                }
                if (event.key === "Tab" && event.shiftKey && permissionMode && onPermissionModeChange) {
                  event.preventDefault();
                  onPermissionModeChange(cyclePermissionMode({ providerId: selectedModel.providerId === "stave" ? "claude-code" : selectedModel.providerId, current: permissionMode }));
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
                // Palette open but has 0 items (empty state): block Enter from sending
                if (activePalette !== null) {
                  event.preventDefault();
                  return;
                }
                event.preventDefault();
                void submitCurrentMessage();
              }}
              placeholder="Use / for commands, $ for skills, @ to search files (Enter to send)"
              className="min-h-[104px] max-h-[240px] resize-none overflow-y-auto rounded-lg border-border/70 bg-background text-lg leading-8 md:text-lg"
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={() => {
            if (activePalette === "skill") {
              setDismissedSkillToken(activeSkillToken?.token ?? null);
              return;
            }
            setDismissedCommandQuery(commandQuery);
          }}
          className="w-[min(34rem,calc(100vw-2rem))] gap-0 rounded-xl border border-border/80 bg-popover p-1 shadow-lg"
        >
          <Command shouldFilter={false} value={paletteValue} onValueChange={() => {}} className="rounded-lg border border-border/60 bg-background/70 p-0">
            <CommandList ref={commandListRef} className="max-h-72">
              {activePalette === "skill" && filteredSkillItems.length === 0 ? (
                <CommandEmpty>No matching skill.</CommandEmpty>
              ) : activePalette === "command" && filteredCommandItems.length === 0 ? (
                <CommandEmpty>No matching slash command.</CommandEmpty>
              ) : (
                <>
                  {activePalette === "skill" && localSkillItems.length > 0 ? (
                    <CommandGroup heading="Workspace skills">
                      {localSkillItems.map(({ item, index }) => (
                        <CommandItem
                          key={item.id}
                          value={item.slug}
                          className="items-start gap-3 rounded-md px-3 py-2"
                          onMouseEnter={() => setSelectedSkillIndex(index)}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applySkillSelection(item);
                          }}
                        >
                          <div className="flex items-start pt-0.5">
                            {renderSkillScopeIcon(item.scope)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.invocationToken}</span>
                              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                                {item.provider === "shared" ? "Shared" : item.provider === "claude-code" ? "Claude" : "Codex"}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                  {activePalette === "skill" && userSkillItems.length > 0 ? (
                    <CommandGroup heading="User skills">
                      {userSkillItems.map(({ item, index }) => (
                        <CommandItem
                          key={item.id}
                          value={item.slug}
                          className="items-start gap-3 rounded-md px-3 py-2"
                          onMouseEnter={() => setSelectedSkillIndex(index)}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applySkillSelection(item);
                          }}
                        >
                          <div className="flex items-start pt-0.5">
                            {renderSkillScopeIcon(item.scope)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.invocationToken}</span>
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                                {item.provider === "shared" ? "Shared" : item.provider === "claude-code" ? "Claude" : "Codex"}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                  {activePalette === "skill" && globalSkillItems.length > 0 ? (
                    <CommandGroup heading="Global skills">
                      {globalSkillItems.map(({ item, index }) => (
                        <CommandItem
                          key={item.id}
                          value={item.slug}
                          className="items-start gap-3 rounded-md px-3 py-2"
                          onMouseEnter={() => setSelectedSkillIndex(index)}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applySkillSelection(item);
                          }}
                        >
                          <div className="flex items-start pt-0.5">
                            {renderSkillScopeIcon(item.scope)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.invocationToken}</span>
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                                {item.provider === "shared" ? "Shared" : item.provider === "claude-code" ? "Claude" : "Codex"}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                  {activePalette === "command" && staveCommandItems.length > 0 ? (
                    <CommandGroup heading="Stave commands">
                      {staveCommandItems.map(({ item, index }) => (
                        <CommandItem
                          key={item.id}
                          value={item.command}
                          className="items-start gap-3 rounded-md px-3 py-2"
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
                  {activePalette === "command" && providerCommandItems.length > 0 ? (
                    <CommandGroup heading={selectedModel.providerId === "claude-code" ? "Claude native commands" : "Provider commands"}>
                      {providerCommandItems.map(({ item, index }) => (
                        <CommandItem
                          key={item.id}
                          value={item.command}
                          className="items-start gap-3 rounded-md px-3 py-2"
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
            {activePalette === "skill" ? (
              <div className="border-t border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <Sparkles className="size-3.5" />
                  Tab inserts the highlighted skill token. Selected skills are normalized on send.
                </p>
                <p className="mt-2">
                  `Claude` uses native `/skill-name` dispatch. `Codex` receives the resolved skill instructions as prompt context.
                </p>
              </div>
            ) : activePalette === "command" ? (
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
      {attachedFilePaths.length > 0 || imageAttachments.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {attachedFilePaths.map((filePath) => (
            <div key={filePath} className="flex items-center gap-1 rounded-sm border border-border/80 bg-secondary/50 px-2 py-1 text-sm">
              <span className="font-medium">{filePath}</span>
              <button
                type="button"
                disabled={interactionsDisabled}
                onClick={() => onAttachFilesChange({ filePaths: attachedFilePaths.filter((p) => p !== filePath) })}
                className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {imageAttachments.map((img) => (
            <div key={img.id} className="relative flex items-center gap-1 rounded-sm border border-border/80 bg-secondary/50 p-1">
              <img
                src={img.dataUrl}
                alt={img.label}
                className="max-h-16 max-w-24 cursor-zoom-in rounded-sm object-cover"
                title="Click to view full size"
                onClick={() => setImagePreviewSrc({ dataUrl: img.dataUrl, label: img.label })}
              />
              <button
                type="button"
                disabled={interactionsDisabled}
                onClick={() => onAttachmentsChange?.({
                  attachments: (attachments ?? []).filter((a) => !(a.kind === "image" && a.id === img.id)),
                })}
                className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 text-muted-foreground shadow-sm hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
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
            {filteredFiles.map((filePath) => {
              const isSelected = attachedFilePaths.includes(filePath);
              return (
                <button
                  type="button"
                  key={filePath}
                  disabled={interactionsDisabled}
                  onClick={() => {
                    onAttachFilesChange({
                      filePaths: isSelected
                        ? attachedFilePaths.filter((p) => p !== filePath)
                        : [...attachedFilePaths, filePath],
                    });
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary/70",
                    isSelected && "bg-secondary/80",
                  )}
                >
                  {isSelected ? <Check className="size-3.5 shrink-0 text-foreground" /> : <span className="size-3.5 shrink-0" />}
                  {filePath}
                </button>
              );
            })}
            {filteredFiles.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">No matching files.</p> : null}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <ModelSelector
            value={selectedModel}
            options={modelOptions}
            disabled={interactionsDisabled}
            onSelect={({ selection }) => onModelSelect({ selection })}
          />
          {onFastModeChange ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={interactionsDisabled}
                  onClick={() => onFastModeChange(!fastMode)}
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
                    fastMode
                      ? "border-amber-500/60 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                      : "border-border/70 bg-secondary text-muted-foreground hover:bg-secondary/60",
                    interactionsDisabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <Zap className={cn("size-3.5", fastMode && "fill-amber-400")} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {fastMode ? "Fast mode ON — faster responses with smaller model" : "Fast mode OFF"}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {onPlanModeChange ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={interactionsDisabled}
                  onClick={() => onPlanModeChange(!planMode)}
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
                    planMode
                      ? "border-primary/60 bg-primary/15 text-primary hover:bg-primary/25"
                      : "border-border/70 bg-secondary text-muted-foreground hover:bg-secondary/60",
                    interactionsDisabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <ClipboardCheck className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{planMode ? "Plan mode ON" : "Plan mode OFF"}</TooltipContent>
            </Tooltip>
          ) : null}
          {onThinkingModeChange ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={interactionsDisabled}
                  onClick={() => {
                    const cycle = { adaptive: "enabled", enabled: "disabled", disabled: "adaptive" } as const;
                    onThinkingModeChange(cycle[thinkingMode ?? "adaptive"]);
                  }}
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
                    thinkingMode === "enabled"
                      ? "border-primary/60 bg-primary/15 text-primary hover:bg-primary/25"
                      : thinkingMode === "disabled"
                        ? "border-border/70 bg-secondary text-muted-foreground/50 hover:bg-secondary/60"
                        : "border-border/70 bg-secondary text-muted-foreground hover:bg-secondary/60",
                    interactionsDisabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <Brain className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{`Thinking: ${thinkingMode ?? "adaptive"}`}</TooltipContent>
            </Tooltip>
          ) : null}
          {hasControlsDrawerContent ? (
            <Drawer direction="bottom">
              <Tooltip>
                <TooltipTrigger asChild>
                  <DrawerTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={interactionsDisabled}
                      className="h-9 w-9 rounded-md border border-border/70 bg-secondary p-0 text-muted-foreground hover:bg-secondary/60"
                      aria-label="Controls & Runtime"
                    >
                      <SlidersHorizontal className="size-3.5" />
                    </Button>
                  </DrawerTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">Controls & Runtime</TooltipContent>
              </Tooltip>
              <DrawerContent className="border-border/80 bg-card/95 shadow-2xl supports-backdrop-filter:backdrop-blur-xl data-[vaul-drawer-direction=bottom]:max-h-[78vh]">
                <DrawerHeader className="gap-2 border-b border-border/70 px-5 pb-5 pt-5 text-left md:px-6">
                  <DrawerTitle className="text-lg font-semibold">Controls & Runtime</DrawerTitle>
                  <DrawerDescription>
                    Adjust provider controls and inspect the current runtime configuration for this composer.
                  </DrawerDescription>
                </DrawerHeader>
                <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
                  {showStandalonePermissionSelector ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Permission
                      </p>
                      <PermissionModeSelector
                        providerId={selectedModel.providerId === "stave" ? "claude-code" : selectedModel.providerId}
                        value={permissionMode as PermissionModeValue}
                        disabled={interactionsDisabled}
                        onSelect={onPermissionModeChange!}
                      />
                    </div>
                  ) : null}
                  <PromptInputRuntimeBar
                    quickControls={runtimeQuickControls}
                    statusItems={runtimeStatusItems}
                    disabled={interactionsDisabled}
                    withBorder={false}
                    className={cn(showStandalonePermissionSelector && "mt-5")}
                  />
                </div>
              </DrawerContent>
            </Drawer>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <DropdownMenu>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={interactionsDisabled}
                    className={cn(
                      "h-9 w-9 rounded-md border border-border/70 bg-secondary p-0 text-muted-foreground hover:bg-secondary/60",
                      attachOpen && "bg-secondary/90 text-foreground",
                    )}
                    aria-label="Attach file or capture screenshot"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">Attach file or screenshot</TooltipContent>
              <DropdownMenuContent side="top" align="end">
                <DropdownMenuItem onClick={() => setAttachOpen((prev) => !prev)}>
                  <FilePlus2 className="mr-2 size-3.5" />
                  Attach file
                </DropdownMenuItem>
                {screenshotAvailable ? (
                  <DropdownMenuItem onClick={() => onCaptureScreenshot?.()}>
                    <Camera className="mr-2 size-3.5" />
                    Screenshot
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </Tooltip>
          {isTurnActive ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-md px-3.5 text-sm"
                  onClick={() => onAbort?.()}
                >
                  <OctagonX className="size-3.5" />
                  Abort
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span>Stop responding</span>
                <Kbd>Esc</Kbd>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="submit" size="sm" className="h-9 rounded-md px-3.5 text-sm" disabled={disabled}>
                  <Send className="size-3.5" />
                  Send
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span>Send message</span>
                <KbdGroup>
                  <Kbd>↵</Kbd>
                </KbdGroup>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </form>
    {imagePreviewSrc ? (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-overlay p-6 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-label="Image full screen preview"
        onClick={() => setImagePreviewSrc(null)}
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-sm border border-border/80 bg-card/90 px-2 py-1 text-sm text-foreground hover:bg-accent"
          onClick={(event) => {
            event.stopPropagation();
            setImagePreviewSrc(null);
          }}
        >
          Close
        </button>
        <img
          src={imagePreviewSrc.dataUrl}
          alt={imagePreviewSrc.label}
          className="max-h-full max-w-full cursor-zoom-out object-contain"
          title="Click to close"
          onClick={(event) => {
            event.stopPropagation();
            setImagePreviewSrc(null);
          }}
        />
      </div>
    ) : null}
    </>
  );
}
