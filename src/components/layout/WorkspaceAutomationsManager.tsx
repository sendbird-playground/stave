import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  FilePenLine,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  toast,
} from "@/components/ui";
import {
  AUTOMATION_TRIGGER_METADATA,
  AUTOMATION_TRIGGER_IDS,
  AUTOMATIONS_CONFIG_FILENAME,
  DEFAULT_AUTOMATION_TARGET_IDS,
  STAVE_CONFIG_DIR,
} from "@/lib/workspace-scripts/constants";
import {
  buildAutomationConfigFromEditorState,
  buildAutomationEditorCandidates,
  buildAutomationEditorState,
  createEmptyAutomationEditorEntry,
  createEmptyAutomationEditorState,
  formatAutomationConfigFile,
  mergeAutomationConfigIntoRaw,
  validateAutomationEditorState,
  type AutomationEditorCandidate,
  type AutomationEditorEntry,
  type AutomationEditorHookLink,
  type AutomationEditorState,
} from "@/lib/workspace-scripts/editor";
import { AutomationsConfigSchema } from "@/lib/workspace-scripts/schemas";
import type {
  AutomationKind,
  AutomationTrigger,
  ResolvedWorkspaceAutomationsConfig,
  WorkspaceAutomationsConfig,
} from "@/lib/workspace-scripts/types";
import { cn } from "@/lib/utils";

type AutomationEditorScopeId = "project" | "workspace";

interface AutomationEditorScope {
  id: AutomationEditorScopeId;
  label: string;
  description: string;
  rootPath: string;
  filePath: string;
}

interface EditorFileState {
  status: "idle" | "loading" | "ready" | "error";
  exists: boolean;
  revision: string | null;
  rawConfig: Record<string, unknown> | null;
  parsedConfig: WorkspaceAutomationsConfig | null;
  error: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildEditorScopes(args: {
  projectPath: string;
  workspacePath: string;
}) {
  const scopes: AutomationEditorScope[] = [
    {
      id: "project",
      label: "Project Config",
      description: "Shared `.stave/automations.json` for the repository.",
      rootPath: args.projectPath,
      filePath: `${STAVE_CONFIG_DIR}/${AUTOMATIONS_CONFIG_FILENAME}`,
    },
  ];

  if (args.workspacePath && args.workspacePath !== args.projectPath) {
    scopes.unshift({
      id: "workspace",
      label: "Workspace Config",
      description: "Highest-priority `.stave/automations.json` for the active workspace.",
      rootPath: args.workspacePath,
      filePath: `${STAVE_CONFIG_DIR}/${AUTOMATIONS_CONFIG_FILENAME}`,
    });
  }

  return scopes;
}

function targetLabel(
  targetId: string,
  knownTargets: Array<{ id: string; label: string }>,
) {
  return knownTargets.find((target) => target.id === targetId)?.label ?? targetId;
}

function isHookLinked(
  links: AutomationEditorHookLink[] | undefined,
  candidate: AutomationEditorCandidate,
) {
  return (links ?? []).some((link) => (
    link.automationId === candidate.automationId
    && (link.automationKind === candidate.automationKind || link.automationKind === null)
  ));
}

function getHookBlocking(
  links: AutomationEditorHookLink[] | undefined,
  candidate: AutomationEditorCandidate,
) {
  return (links ?? []).find((link) => (
    link.automationId === candidate.automationId
    && (link.automationKind === candidate.automationKind || link.automationKind === null)
  ))?.blocking ?? true;
}

function removeMatchingHookLinks(
  links: AutomationEditorHookLink[] | undefined,
  args: { automationId: string; automationKind: AutomationKind },
) {
  return (links ?? []).filter((link) => !(
    link.automationId === args.automationId
    && link.automationKind === args.automationKind
  ));
}

function AutomationEntryEditor(props: {
  entry: AutomationEditorEntry;
  index: number;
  kind: AutomationKind;
  targetOptions: Array<{ id: string; label: string }>;
  onFieldChange: (
    index: number,
    field: keyof AutomationEditorEntry,
    value: string | boolean,
  ) => void;
  onRemove: (index: number) => void;
}) {
  const title = props.entry.label.trim()
    || props.entry.id.trim()
    || `${props.kind === "service" ? "Service" : "Action"} ${props.index + 1}`;

  return (
    <AccordionItem
      value={`${props.kind}:${props.index}`}
      className="rounded-lg border border-border/70 bg-background/80 px-3"
    >
      <AccordionTrigger className="gap-3 py-3 no-underline hover:no-underline">
        <div className="min-w-0 flex-1 space-y-1 pr-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{title}</span>
            <Badge variant="outline" className="rounded-sm px-2 py-0">
              {props.entry.id.trim() || "draft id"}
            </Badge>
            <Badge variant="secondary" className="rounded-sm px-2 py-0 font-normal">
              {targetLabel(props.entry.target, props.targetOptions)}
            </Badge>
            {props.kind === "service" && props.entry.orbitEnabled ? (
              <Badge variant="secondary" className="rounded-sm px-2 py-0">
                Orbit
              </Badge>
            ) : null}
            {!props.entry.enabled ? (
              <Badge variant="secondary" className="rounded-sm px-2 py-0">
                Disabled
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {props.entry.description.trim() || "One command per line. JSON stays normalized behind the form."}
          </p>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-1">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">ID</span>
            <Input
              value={props.entry.id}
              onChange={(event) => props.onFieldChange(props.index, "id", event.target.value)}
              placeholder={props.kind === "service" ? "dev-server" : "bootstrap"}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">Label</span>
            <Input
              value={props.entry.label}
              onChange={(event) => props.onFieldChange(props.index, "label", event.target.value)}
              placeholder="Shown in the GUI"
            />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-foreground">Description</span>
            <Input
              value={props.entry.description}
              onChange={(event) => props.onFieldChange(props.index, "description", event.target.value)}
              placeholder="Short summary of what this automation does"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">Target</span>
            <Select
              value={props.entry.target}
              onValueChange={(value) => props.onFieldChange(props.index, "target", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a target" />
              </SelectTrigger>
              <SelectContent>
                {props.targetOptions.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">Timeout (ms)</span>
            <Input
              value={props.entry.timeoutMs}
              onChange={(event) => props.onFieldChange(props.index, "timeoutMs", event.target.value)}
              inputMode="numeric"
              placeholder="Optional"
            />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-foreground">Commands</span>
            <Textarea
              value={props.entry.commandsText}
              onChange={(event) => props.onFieldChange(props.index, "commandsText", event.target.value)}
              className="min-h-28"
              placeholder={"bun install\nbun run dev"}
            />
            <span className="block text-[11px] text-muted-foreground">
              One shell command per line.
            </span>
          </label>
          {props.kind === "service" ? (
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-medium text-foreground">Orbit Name</span>
              <Input
                value={props.entry.orbitName}
                onChange={(event) => props.onFieldChange(props.index, "orbitName", event.target.value)}
                placeholder="Optional base host name override"
                disabled={!props.entry.orbitEnabled}
              />
              <span className="block text-[11px] text-muted-foreground">
                Optional `portless --name` override. Orbit services must target the workspace.
              </span>
            </label>
          ) : null}
          {props.kind === "service" ? (
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">Orbit Proxy Port</span>
              <Input
                value={props.entry.orbitProxyPort}
                onChange={(event) => props.onFieldChange(props.index, "orbitProxyPort", event.target.value)}
                inputMode="numeric"
                placeholder="Optional"
                disabled={!props.entry.orbitEnabled}
              />
              <span className="block text-[11px] text-muted-foreground">
                Optional portless proxy port override.
              </span>
            </label>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Switch
              checked={props.entry.enabled}
              onCheckedChange={(checked) => props.onFieldChange(props.index, "enabled", checked)}
            />
            <span className="text-xs text-foreground">Enabled</span>
          </div>
          {props.kind === "service" ? (
            <>
              <div className="flex items-center gap-2">
                <Switch
                  checked={props.entry.restartOnRun}
                  onCheckedChange={(checked) => props.onFieldChange(props.index, "restartOnRun", checked)}
                />
                <span className="text-xs text-foreground">Restart on run</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={props.entry.orbitEnabled}
                  onCheckedChange={(checked) => props.onFieldChange(props.index, "orbitEnabled", checked)}
                />
                <span className="text-xs text-foreground">Use Orbit</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={props.entry.orbitNoTls}
                  disabled={!props.entry.orbitEnabled}
                  onCheckedChange={(checked) => props.onFieldChange(props.index, "orbitNoTls", checked)}
                />
                <span className="text-xs text-foreground">Plain HTTP</span>
              </div>
            </>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="ml-auto"
            onClick={() => props.onRemove(props.index)}
          >
            <Trash2 className="mr-1 size-4" />
            Remove
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function HookTriggerEditor(props: {
  trigger: AutomationTrigger;
  candidates: AutomationEditorCandidate[];
  links: AutomationEditorHookLink[] | undefined;
  onToggleLink: (trigger: AutomationTrigger, candidate: AutomationEditorCandidate, enabled: boolean) => void;
  onToggleBlocking: (trigger: AutomationTrigger, candidate: AutomationEditorCandidate, blocking: boolean) => void;
}) {
  const triggerMeta = AUTOMATION_TRIGGER_METADATA[props.trigger];
  return (
    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{triggerMeta.label}</p>
            {triggerMeta.legacy ? (
              <Badge variant="secondary" className="rounded-sm px-2 py-0">
                Legacy
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{triggerMeta.description}</p>
        </div>
        <Badge variant="outline" className="rounded-sm px-2 py-0">
          {(props.links ?? []).length} linked
        </Badge>
      </div>

      {props.candidates.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/70 bg-muted/15 px-3 py-3 text-xs text-muted-foreground">
          Add an action or service first.
        </div>
      ) : (
        <div className="space-y-2">
          {props.candidates.map((candidate) => {
            const linked = isHookLinked(props.links, candidate);
            const blocking = getHookBlocking(props.links, candidate);

            return (
              <div
                key={`${candidate.automationKind}:${candidate.automationId}`}
                className="rounded-md border border-border/70 bg-muted/10 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{candidate.label}</span>
                      <Badge variant="outline" className="rounded-sm px-2 py-0">
                        {candidate.automationKind}
                      </Badge>
                      <Badge variant="secondary" className="rounded-sm px-2 py-0 font-normal">
                        {candidate.automationId}
                      </Badge>
                    </div>
                    {candidate.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">{candidate.description}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={linked}
                        onCheckedChange={(checked) => props.onToggleLink(props.trigger, candidate, checked)}
                      />
                      <span className="text-xs text-foreground">Enabled</span>
                    </div>
                    <div className={cn(
                      "flex items-center gap-2 text-xs",
                      !linked && "opacity-60",
                    )}
                    >
                      <Switch
                        checked={blocking}
                        disabled={!linked}
                        onCheckedChange={(checked) => props.onToggleBlocking(props.trigger, candidate, checked)}
                      />
                      <span className="text-foreground">Blocking</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function WorkspaceAutomationsManager(props: {
  projectPath: string;
  workspacePath: string;
  resolvedConfig: ResolvedWorkspaceAutomationsConfig | null;
  onSaved?: () => Promise<void> | void;
}) {
  const scopes = useMemo(
    () => buildEditorScopes({
      projectPath: props.projectPath,
      workspacePath: props.workspacePath,
    }),
    [props.projectPath, props.workspacePath],
  );
  const [selectedScopeId, setSelectedScopeId] = useState<AutomationEditorScopeId>("project");
  const selectedScope = useMemo(
    () => scopes.find((scope) => scope.id === selectedScopeId) ?? scopes[0] ?? null,
    [scopes, selectedScopeId],
  );

  const [fileState, setFileState] = useState<EditorFileState>({
    status: "idle",
    exists: false,
    revision: null,
    rawConfig: null,
    parsedConfig: null,
    error: "",
  });
  const [editorState, setEditorState] = useState<AutomationEditorState>(createEmptyAutomationEditorState());
  const [savedContentSnapshot, setSavedContentSnapshot] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedActions, setExpandedActions] = useState<string[]>([]);
  const [expandedServices, setExpandedServices] = useState<string[]>([]);
  const resolvedConfigRef = useRef(props.resolvedConfig);

  useEffect(() => {
    resolvedConfigRef.current = props.resolvedConfig;
  }, [props.resolvedConfig]);

  useEffect(() => {
    let cancelled = false;

    async function chooseDefaultScope() {
      const workspaceScope = scopes.find((scope) => scope.id === "workspace");
      const readFile = window.api?.fs?.readFile;
      if (!workspaceScope || !readFile) {
        if (!cancelled) {
          setSelectedScopeId("project");
        }
        return;
      }

      const workspaceFile = await readFile({
        rootPath: workspaceScope.rootPath,
        filePath: workspaceScope.filePath,
      });
      if (!cancelled) {
        setSelectedScopeId(workspaceFile.ok ? "workspace" : "project");
      }
    }

    if (scopes.length > 0) {
      void chooseDefaultScope();
    }

    return () => {
      cancelled = true;
    };
  }, [scopes]);

  const loadSelectedScope = useCallback(async (scope: AutomationEditorScope) => {
    const readFile = window.api?.fs?.readFile;
    if (!readFile) {
      setFileState({
        status: "error",
        exists: false,
        revision: null,
        rawConfig: null,
        parsedConfig: null,
        error: "Filesystem bridge unavailable.",
      });
      return;
    }

    setFileState((current) => ({
      ...current,
      status: "loading",
      error: "",
    }));

    const result = await readFile({
      rootPath: scope.rootPath,
      filePath: scope.filePath,
    });

    if (!result.ok) {
      if (result.stderr?.includes("ENOENT")) {
        const emptyState = createEmptyAutomationEditorState();
        const initialContent = formatAutomationConfigFile(
          mergeAutomationConfigIntoRaw({
            rawConfig: null,
            config: buildAutomationConfigFromEditorState(emptyState),
          }),
        );
        setEditorState(emptyState);
        setExpandedActions([]);
        setExpandedServices([]);
        setSavedContentSnapshot(initialContent);
        setFileState({
          status: "ready",
          exists: false,
          revision: null,
          rawConfig: null,
          parsedConfig: null,
          error: "",
        });
        return;
      }

      setFileState({
        status: "error",
        exists: false,
        revision: null,
        rawConfig: null,
        parsedConfig: null,
        error: result.stderr ?? "Failed to read automation config.",
      });
      return;
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(result.content);
    } catch (error) {
      setFileState({
        status: "error",
        exists: true,
        revision: result.revision,
        rawConfig: null,
        parsedConfig: null,
        error: `Invalid JSON in ${scope.filePath}: ${String(error)}`,
      });
      return;
    }

    if (!isPlainRecord(rawJson)) {
      setFileState({
        status: "error",
        exists: true,
        revision: result.revision,
        rawConfig: null,
        parsedConfig: null,
        error: `Expected an object in ${scope.filePath}.`,
      });
      return;
    }

    const parsed = AutomationsConfigSchema.safeParse(rawJson);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFileState({
        status: "error",
        exists: true,
        revision: result.revision,
        rawConfig: rawJson,
        parsedConfig: null,
        error: `${scope.filePath} is not a valid shared automations config: ${issue?.message ?? "Unknown error."}`,
      });
      return;
    }

    const nextEditorState = buildAutomationEditorState({
      config: parsed.data,
      resolvedConfig: resolvedConfigRef.current,
    });
    const initialContent = formatAutomationConfigFile(
      mergeAutomationConfigIntoRaw({
        rawConfig: rawJson,
        config: buildAutomationConfigFromEditorState(nextEditorState),
      }),
    );

    setEditorState(nextEditorState);
    setExpandedActions([]);
    setExpandedServices([]);
    setSavedContentSnapshot(initialContent);
    setFileState({
      status: "ready",
      exists: true,
      revision: result.revision,
      rawConfig: rawJson,
      parsedConfig: parsed.data,
      error: "",
    });
  }, []);

  useEffect(() => {
    if (!selectedScope) {
      return;
    }
    void loadSelectedScope(selectedScope);
  }, [loadSelectedScope, selectedScope]);

  const currentConfig = useMemo(
    () => buildAutomationConfigFromEditorState(editorState),
    [editorState],
  );
  const currentSaveContent = useMemo(
    () => formatAutomationConfigFile(
      mergeAutomationConfigIntoRaw({
        rawConfig: fileState.rawConfig,
        config: currentConfig,
      }),
    ),
    [currentConfig, fileState.rawConfig],
  );
  const isDirty = fileState.status === "ready" && currentSaveContent !== savedContentSnapshot;

  const targetOptions = useMemo(() => {
    const next = new Map<string, string>([
      [DEFAULT_AUTOMATION_TARGET_IDS.WORKSPACE, "Workspace"],
      [DEFAULT_AUTOMATION_TARGET_IDS.PROJECT, "Project"],
    ]);

    for (const target of Object.values(props.resolvedConfig?.targets ?? {})) {
      next.set(target.id, target.label);
    }

    for (const [targetId, target] of Object.entries(fileState.parsedConfig?.targets ?? {})) {
      next.set(targetId, target.label?.trim() || targetId);
    }

    for (const entry of [...editorState.actions, ...editorState.services]) {
      const targetId = entry.target.trim();
      if (targetId) {
        next.set(targetId, next.get(targetId) ?? targetId);
      }
    }

    return [...next.entries()].map(([id, label]) => ({ id, label }));
  }, [editorState.actions, editorState.services, fileState.parsedConfig?.targets, props.resolvedConfig?.targets]);

  const hookCandidates = useMemo(
    () => buildAutomationEditorCandidates({
      state: editorState,
      resolvedConfig: props.resolvedConfig,
    }),
    [editorState, props.resolvedConfig],
  );

  const unresolvedHookRefs = useMemo(() => {
    return AUTOMATION_TRIGGER_IDS.flatMap((trigger) => (
      editorState.hooks[trigger] ?? []
    ).filter((link) => {
      if (link.automationKind) {
        return !hookCandidates.some((candidate) => (
          candidate.automationId === link.automationId
          && candidate.automationKind === link.automationKind
        ));
      }
      return !hookCandidates.some((candidate) => candidate.automationId === link.automationId);
    }).map((link) => ({
      trigger,
      link,
    })));
  }, [editorState.hooks, hookCandidates]);

  const updateEntryField = useCallback((
    kind: AutomationKind,
    index: number,
    field: keyof AutomationEditorEntry,
    value: string | boolean,
  ) => {
    setEditorState((current) => {
      const collectionKey = kind === "service" ? "services" : "actions";
      const nextEntries = current[collectionKey].map((entry, entryIndex) => (
        entryIndex === index
          ? { ...entry, [field]: value }
          : entry
      ));

      let nextHooks = current.hooks;
      if (field === "id") {
        const previousId = current[collectionKey][index]?.id.trim();
        const nextId = String(value).trim();
        if (previousId && previousId !== nextId) {
          nextHooks = Object.fromEntries(
            Object.entries(current.hooks).map(([trigger, links]) => [
              trigger,
              (links ?? []).map((link) => (
                link.automationId === previousId && link.automationKind === kind
                  ? { ...link, automationId: nextId }
                  : link
              )),
            ]),
          ) as AutomationEditorState["hooks"];
        }
      }

      return {
        ...current,
        [collectionKey]: nextEntries,
        hooks: nextHooks,
      };
    });
  }, []);

  const addEntry = useCallback((kind: AutomationKind) => {
    setEditorState((current) => {
      const collectionKey = kind === "service" ? "services" : "actions";
      return {
        ...current,
        [collectionKey]: [...current[collectionKey], createEmptyAutomationEditorEntry(kind)],
      };
    });

    if (kind === "service") {
      setExpandedServices((current) => [...current, `${kind}:${editorState.services.length}`]);
      return;
    }
    setExpandedActions((current) => [...current, `${kind}:${editorState.actions.length}`]);
  }, [editorState.actions.length, editorState.services.length]);

  const removeEntry = useCallback((kind: AutomationKind, index: number) => {
    setEditorState((current) => {
      const collectionKey = kind === "service" ? "services" : "actions";
      const removedEntry = current[collectionKey][index];
      const nextEntries = current[collectionKey].filter((_, entryIndex) => entryIndex !== index);
      const nextHooks = Object.fromEntries(
        Object.entries(current.hooks).map(([trigger, links]) => [
          trigger,
          removeMatchingHookLinks(links, {
            automationId: removedEntry?.id.trim() ?? "",
            automationKind: kind,
          }),
        ]).filter(([, links]) => (links as AutomationEditorHookLink[]).length > 0),
      ) as AutomationEditorState["hooks"];

      return {
        ...current,
        [collectionKey]: nextEntries,
        hooks: nextHooks,
      };
    });
  }, []);

  const updateHookLinks = useCallback((
    trigger: AutomationTrigger,
    nextLinks: AutomationEditorHookLink[],
  ) => {
    setEditorState((current) => ({
      ...current,
      hooks: {
        ...current.hooks,
        ...(nextLinks.length > 0 ? { [trigger]: nextLinks } : { [trigger]: undefined }),
      },
    }));
  }, []);

  const toggleHookLink = useCallback((
    trigger: AutomationTrigger,
    candidate: AutomationEditorCandidate,
    enabled: boolean,
  ) => {
    const currentLinks = editorState.hooks[trigger] ?? [];
    if (!enabled) {
      updateHookLinks(
        trigger,
        currentLinks.filter((link) => !(
          link.automationId === candidate.automationId
          && (link.automationKind === candidate.automationKind || link.automationKind === null)
        )),
      );
      return;
    }

    if (isHookLinked(currentLinks, candidate)) {
      updateHookLinks(
        trigger,
        currentLinks.map((link) => (
          link.automationId === candidate.automationId && link.automationKind === null
            ? { ...link, automationKind: candidate.automationKind }
            : link
        )),
      );
      return;
    }

    updateHookLinks(trigger, [
      ...currentLinks,
      {
        automationId: candidate.automationId,
        automationKind: candidate.automationKind,
        blocking: true,
      },
    ]);
  }, [editorState.hooks, updateHookLinks]);

  const toggleHookBlocking = useCallback((
    trigger: AutomationTrigger,
    candidate: AutomationEditorCandidate,
    blocking: boolean,
  ) => {
    updateHookLinks(
      trigger,
      (editorState.hooks[trigger] ?? []).map((link) => (
        link.automationId === candidate.automationId
        && (link.automationKind === candidate.automationKind || link.automationKind === null)
          ? { ...link, automationKind: link.automationKind ?? candidate.automationKind, blocking }
          : link
      )),
    );
  }, [editorState.hooks, updateHookLinks]);

  const reloadSelectedScope = useCallback(async () => {
    if (!selectedScope) {
      return;
    }
    if (isDirty) {
      toast.message("Discard or save changes before reloading this config.");
      return;
    }
    await loadSelectedScope(selectedScope);
  }, [isDirty, loadSelectedScope, selectedScope]);

  const discardChanges = useCallback(async () => {
    if (!selectedScope) {
      return;
    }
    await loadSelectedScope(selectedScope);
  }, [loadSelectedScope, selectedScope]);

  const saveChanges = useCallback(async () => {
    const writeFile = window.api?.fs?.writeFile;
    const createDirectory = window.api?.fs?.createDirectory;
    if (!selectedScope || !writeFile || !createDirectory) {
      toast.error("Filesystem bridge unavailable");
      return;
    }

    const issues = validateAutomationEditorState(editorState);
    if (issues.length > 0) {
      toast.error("Automation config is incomplete", {
        description: issues[0],
      });
      return;
    }

    setSaving(true);
    try {
      const mkdirResult = await createDirectory({
        rootPath: selectedScope.rootPath,
        directoryPath: STAVE_CONFIG_DIR,
      });
      if (!mkdirResult.ok && !mkdirResult.alreadyExists) {
        toast.error("Failed to prepare .stave directory", {
          description: mkdirResult.stderr ?? "Unknown error",
        });
        return;
      }

      const result = await writeFile({
        rootPath: selectedScope.rootPath,
        filePath: selectedScope.filePath,
        content: currentSaveContent,
        expectedRevision: fileState.revision,
      });
      if (!result.ok) {
        toast.error(result.conflict ? "Automation config changed on disk" : "Failed to save automation config", {
          description: result.stderr ?? (result.conflict
            ? "Reload the file and re-apply your changes."
            : "Unknown error"),
        });
        return;
      }

      await loadSelectedScope(selectedScope);
      await props.onSaved?.();
      toast.success("Automation config saved", {
        description: selectedScope.filePath,
      });
    } finally {
      setSaving(false);
    }
  }, [currentSaveContent, editorState, fileState.revision, loadSelectedScope, props.onSaved, selectedScope]);

  const handleScopeChange = useCallback((value: string) => {
    if (isDirty) {
      toast.message("Save or discard changes before switching configs.");
      return;
    }
    if (value === "project" || value === "workspace") {
      setSelectedScopeId(value);
    }
  }, [isDirty]);

  if (!selectedScope) {
    return (
      <Empty className="border border-dashed border-border/70 bg-muted/15">
        <EmptyHeader>
          <EmptyMedia>
            <FilePenLine className="size-4" />
          </EmptyMedia>
          <EmptyTitle>Automation manager unavailable</EmptyTitle>
          <EmptyDescription>Select a workspace to edit its automation config.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Card size="sm" className="border border-border/70 bg-background/80">
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">Automation Manager</p>
              <Badge
                variant={isDirty ? "secondary" : "outline"}
                className="rounded-sm px-2 py-0"
              >
                {isDirty ? "Unsaved changes" : fileState.exists ? "In sync" : "New file"}
              </Badge>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Edit only actions, services, and hooks here. Targets and advanced local overrides stay preserved but are not editable in this GUI.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-md"
              onClick={() => void reloadSelectedScope()}
              disabled={fileState.status === "loading" || saving}
            >
              <RefreshCcw className={cn("mr-1 size-4", fileState.status === "loading" && "animate-spin")} />
              Reload
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-md"
              onClick={() => void discardChanges()}
              disabled={!isDirty || saving}
            >
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-md"
              onClick={() => void saveChanges()}
              disabled={fileState.status !== "ready" || saving}
            >
              {saving ? <RefreshCcw className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}
              Save
            </Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,280px)_1fr]">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">Config Scope</span>
            <Select value={selectedScope.id} onValueChange={handleScopeChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scopes.map((scope) => (
                  <SelectItem key={scope.id} value={scope.id}>
                    {scope.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5">
            <p className="text-xs font-medium text-foreground">{selectedScope.description}</p>
            <p className="mt-1 break-all text-[11px] leading-5 text-muted-foreground">
              {selectedScope.rootPath}/{selectedScope.filePath}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
          {selectedScope.id === "workspace"
            ? "Workspace config overrides the project shared config for this workspace."
            : "Project config is the shared fallback. If a workspace-level config exists, it wins for the active workspace."}
          {" "}
          For custom targets or `.stave/automations.local.json`, edit JSON directly.
        </div>

        {fileState.error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-xs text-destructive">
            {fileState.error}
          </div>
        ) : null}

        {fileState.status === "loading" ? (
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
            Loading automation manager...
          </div>
        ) : null}

        {fileState.status === "ready" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-sm px-2 py-0">
                {editorState.actions.length} actions
              </Badge>
              <Badge variant="outline" className="rounded-sm px-2 py-0">
                {editorState.services.length} services
              </Badge>
              <Badge variant="outline" className="rounded-sm px-2 py-0">
                {AUTOMATION_TRIGGER_IDS.reduce((sum, trigger) => sum + (editorState.hooks[trigger]?.length ?? 0), 0)} hook links
              </Badge>
            </div>

            <div className="space-y-3">
              <Card size="sm" className="border border-border/70 bg-muted/10">
                <CardContent className="space-y-3 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Actions</p>
                      <p className="text-xs text-muted-foreground">
                        Short-lived commands you run on demand or from hooks.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-md"
                      onClick={() => addEntry("action")}
                    >
                      <Plus className="mr-1 size-4" />
                      Add Action
                    </Button>
                  </div>

                  {editorState.actions.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/70 bg-background/60 px-3 py-3 text-xs text-muted-foreground">
                      No actions yet.
                    </div>
                  ) : (
                    <Accordion type="multiple" value={expandedActions} onValueChange={setExpandedActions}>
                      {editorState.actions.map((entry, index) => (
                        <AutomationEntryEditor
                          key={`action-${index}`}
                          entry={entry}
                          index={index}
                          kind="action"
                          targetOptions={targetOptions}
                          onFieldChange={(entryIndex, field, value) => updateEntryField("action", entryIndex, field, value)}
                          onRemove={(entryIndex) => removeEntry("action", entryIndex)}
                        />
                      ))}
                    </Accordion>
                  )}
                </CardContent>
              </Card>

              <Card size="sm" className="border border-border/70 bg-muted/10">
                <CardContent className="space-y-3 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Services</p>
                      <p className="text-xs text-muted-foreground">
                        Long-running processes that stay available until you stop them.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-md"
                      onClick={() => addEntry("service")}
                    >
                      <Plus className="mr-1 size-4" />
                      Add Service
                    </Button>
                  </div>

                  {editorState.services.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/70 bg-background/60 px-3 py-3 text-xs text-muted-foreground">
                      No services yet.
                    </div>
                  ) : (
                    <Accordion type="multiple" value={expandedServices} onValueChange={setExpandedServices}>
                      {editorState.services.map((entry, index) => (
                        <AutomationEntryEditor
                          key={`service-${index}`}
                          entry={entry}
                          index={index}
                          kind="service"
                          targetOptions={targetOptions}
                          onFieldChange={(entryIndex, field, value) => updateEntryField("service", entryIndex, field, value)}
                          onRemove={(entryIndex) => removeEntry("service", entryIndex)}
                        />
                      ))}
                    </Accordion>
                  )}
                </CardContent>
              </Card>

              <Card size="sm" className="border border-border/70 bg-muted/10">
                <CardContent className="space-y-3 pt-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Hooks</p>
                    <p className="text-xs text-muted-foreground">
                      Wire actions and services into task, turn, PR, and legacy workspace lifecycle triggers.
                    </p>
                  </div>

                  {AUTOMATION_TRIGGER_IDS.map((trigger) => (
                    <HookTriggerEditor
                      key={trigger}
                      trigger={trigger}
                      candidates={hookCandidates}
                      links={editorState.hooks[trigger]}
                      onToggleLink={toggleHookLink}
                      onToggleBlocking={toggleHookBlocking}
                    />
                  ))}

                  {unresolvedHookRefs.length > 0 ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertCircle className="size-4" />
                        Preserved unresolved hook refs
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {unresolvedHookRefs.map(({ trigger, link }, index) => (
                          <Badge key={`${trigger}:${link.automationKind ?? "unknown"}:${link.automationId}:${index}`} variant="secondary" className="rounded-sm px-2 py-0">
                            {AUTOMATION_TRIGGER_METADATA[trigger].label} → {link.automationKind ?? "unknown"}:{link.automationId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
