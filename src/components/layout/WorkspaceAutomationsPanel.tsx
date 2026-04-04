import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, LoaderCircle, Play, RefreshCcw, Settings2, Sparkles, Square, Zap } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  toast,
} from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import type {
  AutomationKind,
  AutomationTrigger,
  ResolvedWorkspaceAutomationsConfig,
  WorkspaceAutomationEventEnvelope,
  WorkspaceAutomationStatusEntry,
} from "@/lib/workspace-scripts/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

interface AutomationUiState {
  running: boolean;
  runId?: string;
  sessionId?: string;
  log: string;
  error?: string;
  orbitUrl?: string;
  sourceLabel?: string;
}

const MAX_LOG_LENGTH = 12_000;

function automationKey(args: { automationId: string; automationKind: AutomationKind }) {
  return `${args.automationKind}:${args.automationId}`;
}

function automationEntryKey(args: { id: string; kind: AutomationKind }) {
  return `${args.kind}:${args.id}`;
}

function appendLog(current: string, chunk: string) {
  const next = current + chunk;
  if (next.length <= MAX_LOG_LENGTH) {
    return next;
  }
  return next.slice(next.length - MAX_LOG_LENGTH);
}

function sourceLabel(event: WorkspaceAutomationEventEnvelope) {
  return event.source.kind === "hook" ? `Hook · ${event.source.trigger}` : "Manual";
}

function openExternalUrl(url: string) {
  void window.api?.shell?.openExternal?.({ url: url.trim() });
}

function HookRow(props: {
  trigger: AutomationTrigger;
  refs: NonNullable<ResolvedWorkspaceAutomationsConfig["hooks"][AutomationTrigger]>;
  onRun: (trigger: AutomationTrigger) => Promise<void>;
  running: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{props.trigger}</p>
            <Badge variant="outline" className="rounded-sm px-2 py-0">
              {props.refs.length} linked
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {props.refs.map((ref) => (
              <Badge
                key={`${ref.automationKind}:${ref.automationId}`}
                variant="secondary"
                className="rounded-sm px-2 py-0 font-normal"
              >
                {ref.automationKind}:{ref.automationId}
              </Badge>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-md"
          onClick={() => void props.onRun(props.trigger)}
          disabled={props.running}
        >
          {props.running ? <LoaderCircle className="mr-1 size-4 animate-spin" /> : <Play className="mr-1 size-4" />}
          Run
        </Button>
      </div>
    </div>
  );
}

function AutomationEntryRow(props: {
  automationId: string;
  automationKind: AutomationKind;
  label: string;
  description: string;
  targetLabel: string;
  orbitEnabled: boolean;
  state: AutomationUiState | undefined;
  onRun: (args: { automationId: string; automationKind: AutomationKind }) => Promise<void>;
  onStop: (args: { automationId: string; automationKind: AutomationKind }) => Promise<void>;
}) {
  const state = props.state;
  const startLabel = props.orbitEnabled ? "Start Orbit" : "Run";
  const stopLabel = props.orbitEnabled ? "Stop Orbit" : "Stop";

  return (
    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{props.label}</p>
            <Badge variant="outline" className="rounded-sm px-2 py-0">
              {props.targetLabel}
            </Badge>
            {props.orbitEnabled ? (
              <Badge variant="secondary" className="rounded-sm px-2 py-0">
                Orbit
              </Badge>
            ) : null}
            {state?.running ? (
              <Badge variant="secondary" className="rounded-sm px-2 py-0 text-primary">
                Running
              </Badge>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{props.description}</p>
          {state?.sourceLabel ? (
            <p className="text-[11px] text-muted-foreground/80">{state.sourceLabel}</p>
          ) : null}
          {state?.orbitUrl ? (
            <p className="text-[11px] text-muted-foreground/80">{state.orbitUrl}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {state?.orbitUrl ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-md"
                onClick={() => openExternalUrl(state.orbitUrl ?? "")}
              >
                <ExternalLink className="mr-1 size-4" />
                Open
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-md"
                onClick={() => void copyTextToClipboard(state.orbitUrl ?? "")}
              >
                <Copy className="mr-1 size-4" />
                Copy URL
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            className="h-8 rounded-md"
            variant={state?.running ? "outline" : "default"}
            onClick={() => void (state?.running
              ? props.onStop({ automationId: props.automationId, automationKind: props.automationKind })
              : props.onRun({ automationId: props.automationId, automationKind: props.automationKind }))}
          >
            {state?.running ? <Square className="mr-1 size-4" /> : <Play className="mr-1 size-4" />}
            {state?.running ? stopLabel : startLabel}
          </Button>
        </div>
      </div>
      {state?.error ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/8 px-2.5 py-2 text-xs text-destructive">
          {state.error}
        </div>
      ) : null}
      {state?.log ? (
        <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-border/70 bg-muted/20 px-2.5 py-2 text-[11px] leading-5 text-muted-foreground whitespace-pre-wrap">
          {state.log}
        </pre>
      ) : null}
    </div>
  );
}

export function WorkspaceAutomationsPanel(props: {
  onOpenSettings?: (options?: {
    projectPath?: string | null;
    section?: SectionId;
  }) => void;
}) {
  const [
    activeWorkspaceId,
    projectPath,
    workspacePath,
    workspaceBranch,
    workspaces,
  ] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.projectPath,
    state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? "",
    state.workspaceBranchById[state.activeWorkspaceId] ?? "",
    state.workspaces,
  ] as const));

  const workspaceName = useMemo(
    () => (workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? workspaceBranch) || "workspace",
    [activeWorkspaceId, workspaceBranch, workspaces],
  );

  const [configState, setConfigState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    config: ResolvedWorkspaceAutomationsConfig | null;
    error: string;
  }>({
    status: "idle",
    config: null,
    error: "",
  });
  const [entryStateByKey, setEntryStateByKey] = useState<Record<string, AutomationUiState>>({});
  const [runningHooks, setRunningHooks] = useState<Record<string, boolean>>({});

  const loadConfig = useCallback(async () => {
    if (!projectPath || !workspacePath) {
      setConfigState({ status: "idle", config: null, error: "" });
      setEntryStateByKey({});
      return;
    }

    const api = window.api?.automations;
    if (!api?.getConfig || !api.getStatus) {
      setConfigState({
        status: "error",
        config: null,
        error: "Automation bridge unavailable.",
      });
      return;
    }

    setConfigState((current) => ({ ...current, status: "loading", error: "" }));
    const [configResult, statusResult] = await Promise.all([
      api.getConfig({ projectPath, workspacePath }),
      activeWorkspaceId ? api.getStatus({ workspaceId: activeWorkspaceId }) : Promise.resolve({ ok: true, statuses: [] as WorkspaceAutomationStatusEntry[] }),
    ]);

    if (!configResult.ok) {
      setConfigState({
        status: "error",
        config: null,
        error: configResult.error ?? "Failed to load automations.",
      });
      return;
    }

    const nextStateByKey: Record<string, AutomationUiState> = {};
    if (statusResult.ok) {
      statusResult.statuses.forEach((status) => {
        nextStateByKey[automationKey(status)] = {
          running: status.running,
          runId: status.runId,
          sessionId: status.sessionId,
          log: "",
          sourceLabel: status.source?.kind === "hook" ? `Hook · ${status.source.trigger}` : "Manual",
        };
      });
    }

    setEntryStateByKey(nextStateByKey);
    setConfigState({
      status: "ready",
      config: configResult.config,
      error: "",
    });
  }, [activeWorkspaceId, projectPath, workspacePath]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const subscribeEvents = window.api?.automations?.subscribeEvents;
    if (!subscribeEvents) {
      return undefined;
    }

    return subscribeEvents((payload) => {
      if (payload.workspaceId !== activeWorkspaceId) {
        return;
      }
      const key = automationKey(payload);
      setEntryStateByKey((current) => {
        const existing = current[key] ?? { running: false, log: "" };
        const next: AutomationUiState = {
          ...existing,
          runId: payload.runId,
          sessionId: payload.sessionId,
          sourceLabel: sourceLabel(payload),
        };

        switch (payload.event.type) {
          case "started":
            next.running = true;
            next.error = undefined;
            next.orbitUrl = undefined;
            break;
          case "orbit-url":
            next.orbitUrl = payload.event.url;
            break;
          case "output":
            next.log = appendLog(existing.log, payload.event.data);
            break;
          case "error":
            next.running = false;
            next.error = payload.event.error;
            break;
          case "completed":
          case "stopped":
            next.running = false;
            break;
          default:
            break;
        }

        return {
          ...current,
          [key]: next,
        };
      });
    });
  }, [activeWorkspaceId]);

  const runEntry = useCallback(async (args: { automationId: string; automationKind: AutomationKind }) => {
    const api = window.api?.automations?.runEntry;
    if (!api || !activeWorkspaceId || !projectPath || !workspacePath) {
      toast.error("Automation bridge unavailable");
      return;
    }
    const result = await api({
      workspaceId: activeWorkspaceId,
      automationId: args.automationId,
      automationKind: args.automationKind,
      projectPath,
      workspacePath,
      workspaceName,
      branch: workspaceBranch || workspaceName,
    });
    if (!result.ok) {
      toast.error("Automation failed to start", {
        description: result.error ?? "Unknown error",
      });
      return;
    }
    if (result.alreadyRunning) {
      toast.message("Service already running");
    }
  }, [activeWorkspaceId, projectPath, workspaceBranch, workspaceName, workspacePath]);

  const stopEntry = useCallback(async (args: { automationId: string; automationKind: AutomationKind }) => {
    const api = window.api?.automations?.stopEntry;
    if (!api || !activeWorkspaceId) {
      toast.error("Automation bridge unavailable");
      return;
    }
    const result = await api({
      workspaceId: activeWorkspaceId,
      automationId: args.automationId,
      automationKind: args.automationKind,
    });
    if (!result.ok) {
      toast.error("Failed to stop automation", {
        description: result.error ?? "Unknown error",
      });
    }
  }, [activeWorkspaceId]);

  const runHook = useCallback(async (trigger: AutomationTrigger) => {
    const api = window.api?.automations?.runHook;
    if (!api || !activeWorkspaceId || !projectPath || !workspacePath) {
      toast.error("Automation bridge unavailable");
      return;
    }
    setRunningHooks((current) => ({ ...current, [trigger]: true }));
    try {
      const result = await api({
        workspaceId: activeWorkspaceId,
        trigger,
        projectPath,
        workspacePath,
        workspaceName,
        branch: workspaceBranch || workspaceName,
      });
      if (!result.ok) {
        toast.error("Hook execution failed", {
          description: result.error ?? result.summary?.failures[0]?.message ?? "Unknown error",
        });
        return;
      }
      toast.success("Hook executed", {
        description: `${result.summary?.executedEntries ?? 0} automation(s) ran for ${trigger}.`,
      });
    } finally {
      setRunningHooks((current) => ({ ...current, [trigger]: false }));
    }
  }, [activeWorkspaceId, projectPath, workspaceBranch, workspaceName, workspacePath]);

  const config = configState.config;
  const hookEntries = config
    ? Object.entries(config.hooks) as Array<[AutomationTrigger, NonNullable<ResolvedWorkspaceAutomationsConfig["hooks"][AutomationTrigger]>]>
    : [];
  const actionCount = config?.actions.length ?? 0;
  const serviceCount = config?.services.length ?? 0;
  const hookCount = hookEntries.length;
  const hasAutomations = actionCount > 0 || serviceCount > 0 || hookCount > 0;
  const hasWorkspaceOverride = Boolean(projectPath && workspacePath && workspacePath !== projectPath);

  const openAutomationSettings = useCallback(() => {
    props.onOpenSettings?.({
      section: "projects",
      projectPath: projectPath ?? null,
    });
  }, [projectPath, props.onOpenSettings]);

  if (!workspacePath) {
    return (
      <Empty className="border border-dashed border-border/70 bg-muted/15">
        <EmptyHeader>
          <EmptyMedia>
            <Sparkles className="size-4" />
          </EmptyMedia>
          <EmptyTitle>Automations unavailable</EmptyTitle>
          <EmptyDescription>Select a workspace to inspect its automation config.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="h-full overflow-auto px-2 py-2">
      <div className="space-y-3">
        <Card size="sm" className="border border-border/70 bg-background/80">
          <CardContent className="space-y-4 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Automation Runtime</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Inspect the merged actions, services, and hooks for the active workspace. Edit shared automation config from Settings.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md"
                  onClick={openAutomationSettings}
                  disabled={!projectPath}
                >
                  <Settings2 className="mr-1 size-4" />
                  Edit Config
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md"
                  onClick={() => void loadConfig()}
                  disabled={configState.status === "loading"}
                >
                  <RefreshCcw className={cn("mr-1 size-4", configState.status === "loading" && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-sm px-2 py-0">
                {actionCount} actions
              </Badge>
              <Badge variant="outline" className="rounded-sm px-2 py-0">
                {serviceCount} services
              </Badge>
              <Badge variant="outline" className="rounded-sm px-2 py-0">
                {hookCount} hooks
              </Badge>
              {hasWorkspaceOverride ? (
                <Badge variant="secondary" className="rounded-sm px-2 py-0">
                  Workspace override active
                </Badge>
              ) : null}
            </div>

            <div className="grid gap-2">
              <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5">
                <p className="text-xs font-medium text-foreground">Project Config</p>
                <p className="mt-1 break-all text-[11px] leading-5 text-muted-foreground">
                  {projectPath ? `${projectPath}/.stave/automations.json` : "Project path unavailable."}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5">
                <p className="text-xs font-medium text-foreground">Workspace Config</p>
                <p className="mt-1 break-all text-[11px] leading-5 text-muted-foreground">
                  {hasWorkspaceOverride
                    ? `${workspacePath}/.stave/automations.json`
                    : "This workspace currently inherits the project shared config."}
                </p>
              </div>
            </div>
            {configState.error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                {configState.error}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {configState.status === "loading" ? (
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
            Loading automation config...
          </div>
        ) : null}

        {configState.status === "ready" && config && !hasAutomations ? (
          <Empty className="border border-dashed border-border/70 bg-muted/15">
            <EmptyHeader>
              <EmptyMedia>
                <Zap className="size-4" />
              </EmptyMedia>
              <EmptyTitle>No automations configured</EmptyTitle>
              <EmptyDescription>Open Settings to create `.stave/automations.json` for the project or active workspace.</EmptyDescription>
            </EmptyHeader>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 h-8 rounded-md"
              onClick={openAutomationSettings}
              disabled={!projectPath}
            >
              <Settings2 className="mr-1 size-4" />
              Open Project Settings
            </Button>
          </Empty>
        ) : null}

        {config?.actions.length ? (
          <Card size="sm" className="border border-border/70 bg-background/80">
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Actions</p>
                <Badge variant="outline" className="rounded-sm">
                  {config.actions.length}
                </Badge>
              </div>
              {config.actions.map((entry) => (
                <AutomationEntryRow
                  key={automationEntryKey(entry)}
                  automationId={entry.id}
                  automationKind={entry.kind}
                  label={entry.label}
                  description={entry.description}
                  targetLabel={entry.target.label}
                  orbitEnabled={Boolean(entry.orbit)}
                  state={entryStateByKey[automationEntryKey(entry)]}
                  onRun={runEntry}
                  onStop={stopEntry}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}

        {config?.services.length ? (
          <Card size="sm" className="border border-border/70 bg-background/80">
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Services</p>
                <Badge variant="outline" className="rounded-sm">
                  {config.services.length}
                </Badge>
              </div>
              {config.services.map((entry) => (
                <AutomationEntryRow
                  key={automationEntryKey(entry)}
                  automationId={entry.id}
                  automationKind={entry.kind}
                  label={entry.label}
                  description={entry.description}
                  targetLabel={entry.target.label}
                  orbitEnabled={Boolean(entry.orbit)}
                  state={entryStateByKey[automationEntryKey(entry)]}
                  onRun={runEntry}
                  onStop={stopEntry}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}

        {hookEntries.length ? (
          <Card size="sm" className="border border-border/70 bg-background/80">
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Hooks</p>
                <Badge variant="outline" className="rounded-sm">
                  {hookEntries.length}
                </Badge>
              </div>
              {hookEntries.map(([trigger, refs]) => (
                <HookRow
                  key={trigger}
                  trigger={trigger}
                  refs={refs}
                  onRun={runHook}
                  running={Boolean(runningHooks[trigger])}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
