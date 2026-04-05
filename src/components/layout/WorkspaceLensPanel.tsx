import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowLeft,
  ArrowRight,
  Crosshair,
  ExternalLink,
  Globe,
  Loader2,
  RotateCw,
  ScanSearch,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from "@/components/ui";
import { formatElementForChat } from "@/lib/lens/lens-element-message";
import type {
  BrowserNavigationState,
  ElementPickerResult,
  LensSourceMappingConfig,
} from "@/lib/lens/lens.types";
import { useAppStore } from "@/store/app.store";

const DEFAULT_NAVIGATION_STATE: BrowserNavigationState = {
  url: "about:blank",
  title: "",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
};

export function WorkspaceLensPanel() {
  const { workspaceId, activeTaskId, sourceMappingConfig } = useAppStore(
    useShallow((state) => ({
      workspaceId: state.activeWorkspaceId,
      activeTaskId: state.activeTaskId,
      sourceMappingConfig: {
        heuristic: state.settings.lensSourceMappingHeuristic,
        reactDebugSource: state.settings.lensSourceMappingReactDebugSource,
      } satisfies LensSourceMappingConfig,
    })),
  );

  const lensApi = window.api?.lens;
  const hasLensApi = Boolean(lensApi);

  const placeholderRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState(DEFAULT_NAVIGATION_STATE.url);
  const [inputUrl, setInputUrl] = useState("");
  const [title, setTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isPickerActive, setIsPickerActive] = useState(false);

  const applyNavigationState = useCallback((state: BrowserNavigationState) => {
    setUrl(state.url);
    setInputUrl(state.url === "about:blank" ? "" : state.url);
    setTitle(state.title);
    setIsLoading(state.isLoading);
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
  }, []);

  const syncBounds = useCallback(() => {
    const el = placeholderRef.current;
    if (!workspaceId || !el || !hasLensApi) {
      return;
    }

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      void window.api?.lens?.setBounds?.({
        workspaceId,
        bounds: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    });
  }, [hasLensApi, workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      applyNavigationState(DEFAULT_NAVIGATION_STATE);
      return;
    }

    applyNavigationState(DEFAULT_NAVIGATION_STATE);

    if (!hasLensApi) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const createResult = await lensApi?.createView?.({ workspaceId });
      if (cancelled || !createResult?.ok) {
        if (!cancelled && createResult && !createResult.ok) {
          toast.error("Lens failed to start", {
            description: createResult.message ?? "Could not create the embedded browser view.",
          });
        }
        return;
      }

      await lensApi?.setVisible?.({ workspaceId, visible: true });

      const stateResult = await lensApi?.getState?.({ workspaceId });
      if (!cancelled && stateResult?.ok && stateResult.state) {
        applyNavigationState(stateResult.state);
      }

      syncBounds();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      void window.api?.lens?.setVisible?.({ workspaceId, visible: false });
    };
  }, [applyNavigationState, hasLensApi, lensApi, syncBounds, workspaceId]);

  useEffect(() => {
    const el = placeholderRef.current;
    if (!workspaceId || !el || !hasLensApi) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      syncBounds();
    });
    resizeObserver.observe(el);

    const handleWindowResize = () => {
      syncBounds();
    };

    window.addEventListener("resize", handleWindowResize);
    const unsubscribeZoom = window.api?.window?.subscribeZoomChanges?.(() => {
      syncBounds();
    });

    syncBounds();

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      unsubscribeZoom?.();
    };
  }, [hasLensApi, syncBounds, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const unsubscribe = window.api?.lens?.subscribeNavigationEvents?.(
      (payload) => {
        if (payload.workspaceId !== workspaceId) {
          return;
        }
        applyNavigationState(payload.state);
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [applyNavigationState, hasLensApi, workspaceId]);

  const navigate = useCallback(
    async (targetUrl: string) => {
      if (!workspaceId || !targetUrl.trim()) {
        return;
      }
      if (!hasLensApi) {
        toast.error("Lens is unavailable", {
          description: "The embedded browser only works in the Electron desktop runtime.",
        });
        return;
      }

      const result = await window.api?.lens?.navigate?.({
        workspaceId,
        url: targetUrl.trim(),
      });

      if (result && !result.ok) {
        toast.error("Navigation failed", {
          description: result.message ?? "Lens could not load that address.",
        });
      }
    },
    [hasLensApi, workspaceId],
  );

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void navigate(inputUrl);
      urlInputRef.current?.blur();
    },
    [inputUrl, navigate],
  );

  const handleUrlKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        setInputUrl(url === "about:blank" ? "" : url);
        urlInputRef.current?.blur();
      }
    },
    [url],
  );

  const goBack = useCallback(() => {
    if (workspaceId) {
      void window.api?.lens?.goBack?.({ workspaceId });
    }
  }, [workspaceId]);

  const goForward = useCallback(() => {
    if (workspaceId) {
      void window.api?.lens?.goForward?.({ workspaceId });
    }
  }, [workspaceId]);

  const reload = useCallback(() => {
    if (workspaceId) {
      void window.api?.lens?.reload?.({ workspaceId });
    }
  }, [workspaceId]);

  const startElementPicker = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    if (!hasLensApi) {
      toast.error("Lens is unavailable", {
        description: "The embedded browser only works in the Electron desktop runtime.",
      });
      return;
    }
    if (!activeTaskId) {
      toast.warning("Select a task first", {
        description: "Lens sends element context into the active task draft.",
      });
      return;
    }

    setIsPickerActive(true);
    try {
      const result = await window.api?.lens?.startElementPicker?.({
        workspaceId,
        options: {
          extractDebugSource: sourceMappingConfig.reactDebugSource,
        },
      });

      if (!result?.ok) {
        toast.error("Element picker failed", {
          description: result?.message ?? "Lens could not start the element picker.",
        });
        return;
      }

      if (!result.result) {
        return;
      }

      const selectionText = formatElementForChat(
        result.result as ElementPickerResult,
        sourceMappingConfig,
      );

      const store = useAppStore.getState();
      const currentText = store.promptDraftByTask[activeTaskId]?.text?.trim() ?? "";
      store.updatePromptDraft({
        taskId: activeTaskId,
        patch: {
          text: currentText ? `${currentText}\n\n${selectionText}` : selectionText,
        },
      });
      useAppStore.setState((state) => ({
        promptFocusNonce: state.promptFocusNonce + 1,
      }));

      toast.success("Lens selection added", {
        description: "Element details were appended to the active task draft.",
      });
    } finally {
      setIsPickerActive(false);
    }
  }, [activeTaskId, hasLensApi, sourceMappingConfig, workspaceId]);

  const pickerDisabled = !hasLensApi || !activeTaskId || url === "about:blank";
  const pickerTooltip = useMemo(() => {
    if (!hasLensApi) {
      return "Lens is only available in the Electron desktop runtime.";
    }
    if (!activeTaskId) {
      return "Select a task first so Lens can append element context to its draft.";
    }
    if (url === "about:blank") {
      return "Open a page first.";
    }
    return "Pick an element and append its structure, styles, and source hints to the active task.";
  }, [activeTaskId, hasLensApi, url]);

  const statusText = title
    ? title
    : hasLensApi
      ? "Open a local or deployed page, then use Pick Element to send UI context into the active task."
      : "Lens requires the Electron desktop runtime.";

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-sidebar/20">
        <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 px-2 py-2">
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={!canGoBack || !hasLensApi}
                  onClick={goBack}
                  aria-label="Go back"
                >
                  <ArrowLeft className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={!canGoForward || !hasLensApi}
                  onClick={goForward}
                  aria-label="Go forward"
                >
                  <ArrowRight className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Forward</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={!hasLensApi}
                  onClick={reload}
                  aria-label={isLoading ? "Stop loading" : "Reload page"}
                >
                  {isLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isLoading ? "Loading" : "Reload"}</TooltipContent>
            </Tooltip>

            <form onSubmit={handleSubmit} className="min-w-0 flex-1">
              <InputGroup className="h-8 bg-background/80">
                <InputGroupAddon align="inline-start" className="gap-1.5 pl-2 text-xs text-muted-foreground">
                  <Globe className="size-3.5" />
                </InputGroupAddon>
                <InputGroupInput
                  ref={urlInputRef}
                  type="text"
                  value={inputUrl}
                  onChange={(event) => setInputUrl(event.target.value)}
                  onKeyDown={handleUrlKeyDown}
                  onFocus={(event) => event.target.select()}
                  placeholder={hasLensApi ? "localhost:3000 or https://example.com" : "Lens is unavailable in browser-only mode"}
                  className="text-xs"
                  disabled={!hasLensApi}
                />
                {inputUrl ? (
                  <InputGroupAddon align="inline-end" className="pr-1">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label="Clear address"
                      onClick={() => setInputUrl("")}
                    >
                      <X className="size-3" />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </form>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="outline"
                  disabled={pickerDisabled || isPickerActive}
                  onClick={() => {
                    void startElementPicker();
                  }}
                  aria-label="Pick element"
                >
                  {isPickerActive ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Crosshair className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-pretty">
                {pickerTooltip}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px] font-medium">
              {workspaceId ? `workspace ${workspaceId}` : "no workspace"}
            </Badge>
            <Badge
              variant={activeTaskId ? "secondary" : "outline"}
              className="h-5 rounded-md px-1.5 text-[10px] font-medium"
            >
              {activeTaskId ? "task linked" : "select task to send"}
            </Badge>
            <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] font-medium">
              {sourceMappingConfig.heuristic ? "heuristic hints on" : "heuristic hints off"}
            </Badge>
            <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] font-medium">
              {sourceMappingConfig.reactDebugSource ? "react source on" : "react source off"}
            </Badge>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            ref={placeholderRef}
            className="absolute inset-0 min-h-0 overflow-hidden bg-background"
          />
          {!hasLensApi ? (
            <div className="absolute inset-0 p-3">
              <Empty className="h-full justify-center rounded-xl border-border/70 bg-background/70 p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ScanSearch />
                  </EmptyMedia>
                  <EmptyTitle>Lens needs the desktop runtime</EmptyTitle>
                  <EmptyDescription>
                    The embedded browser is backed by Electron `WebContentsView`, so it is unavailable in browser-only mode.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>Use `bun run dev:desktop` or a packaged desktop build to inspect pages, capture screenshots, and send element context to a task.</p>
                  </div>
                </EmptyContent>
              </Empty>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-2 py-1.5">
          <div className="min-w-0 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 truncate">
              {isLoading ? <Loader2 className="size-3 animate-spin" /> : null}
              {statusText}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
            <ExternalLink className="size-3" />
            <span>{url === "about:blank" ? "ready" : "live"}</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
