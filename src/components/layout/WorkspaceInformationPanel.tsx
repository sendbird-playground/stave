import {
  Box,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  Info,
  ListTodo,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/components/ui";
import {
  changeWorkspaceInfoCustomFieldType,
  createWorkspaceFigmaResource,
  createWorkspaceInfoCustomField,
  createWorkspaceJiraIssue,
  createWorkspaceLinkedPullRequest,
  createWorkspaceTodoItem,
  extractFigmaResourceReference,
  extractGitHubPullRequestReference,
  extractJiraIssueReference,
  formatWorkspaceInfoHostLabel,
  isGitHubPullRequestUrl,
  isWorkspaceInfoUrl,
  type WorkspaceInfoCustomField,
  type WorkspaceInfoFieldType,
  type WorkspaceInformationState,
  updateWorkspaceInfoSelectFieldOptions,
  WORKSPACE_INFO_FIELD_TYPES,
} from "@/lib/workspace-information";
import {
  derivePrStatus,
  type GitHubPrPayload,
  type WorkspacePrStatus,
  PR_STATUS_VISUAL,
  PR_TONE_BADGE_CLASS,
} from "@/lib/pr-status";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

function updateItemById<T extends { id: string }>(
  items: T[],
  id: string,
  updater: (item: T) => T,
) {
  let changed = false;
  const nextItems = items.map((item) => {
    if (item.id !== id) {
      return item;
    }
    changed = true;
    return updater(item);
  });

  return changed ? nextItems : items;
}

function removeItemById<T extends { id: string }>(items: T[], id: string) {
  const nextItems = items.filter((item) => item.id !== id);
  return nextItems.length === items.length ? items : nextItems;
}

function openExternalUrl(url: string) {
  if (!isWorkspaceInfoUrl(url)) {
    return;
  }
  void window.api?.shell?.openExternal?.({ url: url.trim() });
}

const WORKSPACE_INFORMATION_SECTION_IDS = [
  "overview",
  "note",
  "todo",
  "jira",
  "figma",
  "github",
  "custom",
] as const;

type WorkspaceInformationSectionId =
  (typeof WORKSPACE_INFORMATION_SECTION_IDS)[number];

const WORKSPACE_INFORMATION_ACCORDION_STORAGE_KEY =
  "stave:workspace-information-open-sections:v1";

interface LinkedPullRequestPreview {
  url: string;
  loading: boolean;
  info: {
    pr: GitHubPrPayload;
    derived: WorkspacePrStatus;
  } | null;
  error?: string;
}

function readStoredWorkspaceInformationSections(): WorkspaceInformationSectionId[] {
  if (typeof window === "undefined") {
    return [...WORKSPACE_INFORMATION_SECTION_IDS];
  }

  try {
    const raw = window.localStorage.getItem(
      WORKSPACE_INFORMATION_ACCORDION_STORAGE_KEY,
    );
    if (!raw) {
      return [...WORKSPACE_INFORMATION_SECTION_IDS];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...WORKSPACE_INFORMATION_SECTION_IDS];
    }

    return parsed.filter((value): value is WorkspaceInformationSectionId =>
      WORKSPACE_INFORMATION_SECTION_IDS.includes(
        value as WorkspaceInformationSectionId,
      ),
    );
  } catch {
    return [...WORKSPACE_INFORMATION_SECTION_IDS];
  }
}

function formatCountLabel(count: number, singular: string, plural: string) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function formatFigmaKindLabel(
  kind?: "file" | "design" | "proto" | "board" | "slides" | "unknown",
) {
  if (kind === "proto") {
    return "prototype";
  }
  if (kind === "unknown" || !kind) {
    return "resource";
  }
  return kind;
}

async function fetchLinkedPullRequestPreview(args: {
  cwd: string;
  url: string;
}): Promise<LinkedPullRequestPreview> {
  const getPrStatusForUrl = window.api?.sourceControl?.getPrStatusForUrl;
  if (!getPrStatusForUrl) {
    return {
      url: args.url,
      loading: false,
      info: null,
      error: "GitHub lookup unavailable.",
    };
  }

  try {
    const result = await getPrStatusForUrl({
      cwd: args.cwd,
      url: args.url,
    });
    if (!result.ok || !result.pr) {
      return {
        url: args.url,
        loading: false,
        info: null,
        error: result.stderr || "GitHub PR metadata unavailable.",
      };
    }

    const pr = result.pr as GitHubPrPayload;
    return {
      url: args.url,
      loading: false,
      info: {
        pr,
        derived: derivePrStatus(pr),
      },
    };
  } catch {
    return {
      url: args.url,
      loading: false,
      info: null,
      error: "GitHub PR metadata unavailable.",
    };
  }
}

function SectionMark(props: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/20 text-muted-foreground",
        props.className,
      )}
    >
      {props.children}
    </span>
  );
}

function ServiceMark(props: { label: string }) {
  return (
    <SectionMark className="text-[10px] font-semibold tracking-[0.08em] text-foreground">
      {props.label}
    </SectionMark>
  );
}

function PrStatusBadge(props: { status: WorkspacePrStatus }) {
  const visual = PR_STATUS_VISUAL[props.status];

  return (
    <Badge
      className={cn(
        "rounded-sm border px-2 py-0.5 text-[11px] font-medium",
        PR_TONE_BADGE_CLASS[visual.tone],
      )}
    >
      {visual.label}
    </Badge>
  );
}

function IntegrationCard(props: { children: ReactNode; className?: string }) {
  return (
    <Card
      size="sm"
      className={cn(
        "gap-0 border border-border/70 bg-background/75 shadow-none",
        props.className,
      )}
    >
      <CardContent className="space-y-3 py-4">{props.children}</CardContent>
    </Card>
  );
}

function ConnectionUrlEditor(props: {
  icon: ReactNode;
  url: string;
  placeholder: string;
  helperText?: string;
  onChange: (url: string) => void;
  onRemove: () => void;
}) {
  return (
    <Card
      size="sm"
      className="gap-0 border border-dashed border-border/70 bg-muted/10 shadow-none"
    >
      <CardContent className="space-y-2 py-4">
        <InputGroup>
          <InputGroupAddon>{props.icon}</InputGroupAddon>
          <InputGroupInput
            value={props.url}
            onChange={(event) => props.onChange(event.target.value)}
            placeholder={props.placeholder}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              disabled={!isWorkspaceInfoUrl(props.url)}
              onClick={() => openExternalUrl(props.url)}
              aria-label="Open link"
            >
              <ExternalLink className="size-3.5" />
            </InputGroupButton>
            <InputGroupButton
              size="icon-xs"
              onClick={props.onRemove}
              aria-label="Remove link"
            >
              <Trash2 className="size-3.5" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {props.helperText ? (
          <p className="text-xs text-muted-foreground">{props.helperText}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function WorkspaceInformationSection(props: {
  value: WorkspaceInformationSectionId;
  title: string;
  icon: ReactNode;
  countLabel?: string;
  action?: ReactNode;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <AccordionItem
      value={props.value}
      className={cn(
        "rounded-xl border px-4 shadow-xs",
        props.accent
          ? "border-primary/20 bg-linear-to-br from-primary/8 via-background/95 to-background"
          : "border-border/70 bg-background/85",
      )}
    >
      <div className="flex items-start gap-2">
        <AccordionTrigger className="min-w-0 flex-1 py-3 pl-0 pr-1 hover:no-underline">
          <div className="flex min-w-0 items-start gap-3 text-left">
            {props.icon}
            <div className="min-w-0">
              <div className="flex flex-wrap items-start gap-2">
                <p className="text-sm font-medium text-foreground">
                  {props.title}
                </p>
                {props.countLabel ? (
                  <Badge
                    variant="outline"
                    className="rounded-sm px-1.5 text-[10px]"
                  >
                    {props.countLabel}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </AccordionTrigger>
        {props.action ? <div className="pt-2">{props.action}</div> : null}
      </div>
      <AccordionContent className="pb-4 pt-1">
        {props.children}
      </AccordionContent>
    </AccordionItem>
  );
}

function renderCustomFieldInput(args: {
  field: WorkspaceInfoCustomField;
  onFieldChange: (field: WorkspaceInfoCustomField) => void;
}) {
  const { field, onFieldChange } = args;

  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          className="min-h-20"
          value={field.value}
          onChange={(event) =>
            onFieldChange({ ...field, value: event.target.value })
          }
          placeholder="Field value"
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={field.value ?? ""}
          onChange={(event) =>
            onFieldChange({
              ...field,
              value:
                event.target.value.trim() === ""
                  ? null
                  : Number(event.target.value),
            })
          }
          placeholder="Field value"
        />
      );
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={field.value ? "default" : "outline"}
            className="h-8 rounded-sm"
            onClick={() => onFieldChange({ ...field, value: !field.value })}
          >
            {field.value ? "Enabled" : "Disabled"}
          </Button>
        </div>
      );
    case "date":
      return (
        <Input
          type="date"
          value={field.value}
          onChange={(event) =>
            onFieldChange({ ...field, value: event.target.value })
          }
        />
      );
    case "url":
      return (
        <div className="flex items-center gap-2">
          <Input
            value={field.value}
            onChange={(event) =>
              onFieldChange({ ...field, value: event.target.value })
            }
            placeholder="https://..."
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-sm p-0"
            disabled={!isWorkspaceInfoUrl(field.value)}
            onClick={() => openExternalUrl(field.value)}
            aria-label="Open link"
          >
            <ExternalLink className="size-4" />
          </Button>
        </div>
      );
    case "single_select":
      return (
        <div className="space-y-2">
          <Input
            value={field.options.join(", ")}
            onChange={(event) =>
              onFieldChange(
                updateWorkspaceInfoSelectFieldOptions({
                  field,
                  rawValue: event.target.value,
                }),
              )
            }
            placeholder="Options, comma-separated"
          />
          <Select
            value={field.value}
            onValueChange={(value) => onFieldChange({ ...field, value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {field.options.length === 0 ? (
                <SelectItem value="">No options</SelectItem>
              ) : (
                field.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      );
    case "text":
    default:
      return (
        <Input
          value={field.value}
          onChange={(event) =>
            onFieldChange({ ...field, value: event.target.value })
          }
          placeholder="Field value"
        />
      );
  }
}

export function WorkspaceInformationPanel() {
  const [
    activeWorkspaceId,
    workspaces,
    workspacePath,
    workspaceInformation,
    updateWorkspaceInformation,
    isDefaultWorkspace,
    prInfo,
    fetchWorkspacePrStatus,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.workspaces,
          state.workspacePathById[state.activeWorkspaceId] ??
            state.projectPath ??
            "",
          state.workspaceInformation,
          state.updateWorkspaceInformation,
          Boolean(state.workspaceDefaultById[state.activeWorkspaceId]),
          state.workspacePrInfoById[state.activeWorkspaceId] ?? null,
          state.fetchWorkspacePrStatus,
        ] as const,
    ),
  );

  const workspaceName =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ??
    "Workspace";

  const [openSections, setOpenSections] = useState<
    WorkspaceInformationSectionId[]
  >(() => readStoredWorkspaceInformationSections());
  const [linkedPullRequestPreviewById, setLinkedPullRequestPreviewById] =
    useState<Record<string, LinkedPullRequestPreview>>({});

  useEffect(() => {
    if (!activeWorkspaceId || isDefaultWorkspace) {
      return;
    }
    void fetchWorkspacePrStatus({ workspaceId: activeWorkspaceId });
  }, [activeWorkspaceId, fetchWorkspacePrStatus, isDefaultWorkspace]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        WORKSPACE_INFORMATION_ACCORDION_STORAGE_KEY,
        JSON.stringify(openSections),
      );
    } catch {
      // Ignore localStorage write failures for this UI preference.
    }
  }, [openSections]);

  useEffect(() => {
    const items = workspaceInformation.linkedPullRequests
      .map((item) => ({
        id: item.id,
        url: item.url.trim(),
      }))
      .filter(
        (item) => item.url.length > 0 && isGitHubPullRequestUrl(item.url),
      );

    if (!workspacePath || items.length === 0) {
      setLinkedPullRequestPreviewById({});
      return;
    }

    let cancelled = false;
    setLinkedPullRequestPreviewById(
      Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            url: item.url,
            loading: true,
            info: null,
          },
        ]),
      ),
    );

    void Promise.all(
      items.map(
        async (item) =>
          [
            item.id,
            await fetchLinkedPullRequestPreview({
              cwd: workspacePath,
              url: item.url,
            }),
          ] as const,
      ),
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      setLinkedPullRequestPreviewById(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [workspaceInformation.linkedPullRequests, workspacePath]);

  function patchWorkspaceInformation(
    updater: (current: WorkspaceInformationState) => WorkspaceInformationState,
  ) {
    updateWorkspaceInformation({ updater });
  }

  function patchCustomField(
    fieldId: string,
    updater: (field: WorkspaceInfoCustomField) => WorkspaceInfoCustomField,
  ) {
    patchWorkspaceInformation((current) => ({
      ...current,
      customFields: updateItemById(current.customFields, fieldId, updater),
    }));
  }

  async function refreshLinkedPullRequestPreview(args: {
    itemId: string;
    url: string;
  }) {
    if (!workspacePath || !isGitHubPullRequestUrl(args.url)) {
      return;
    }

    setLinkedPullRequestPreviewById((current) => ({
      ...current,
      [args.itemId]: {
        url: args.url,
        loading: true,
        info: current[args.itemId]?.info ?? null,
      },
    }));

    const preview = await fetchLinkedPullRequestPreview({
      cwd: workspacePath,
      url: args.url,
    });

    setLinkedPullRequestPreviewById((current) => ({
      ...current,
      [args.itemId]: preview,
    }));
  }

  const currentBranchPrCount = prInfo?.pr ? 1 : 0;
  const currentBranchPr = prInfo?.pr ?? null;
  const currentBranchPrStatus = prInfo?.derived ?? null;
  const totalConnections =
    currentBranchPrCount +
    workspaceInformation.jiraIssues.length +
    workspaceInformation.figmaResources.length +
    workspaceInformation.linkedPullRequests.length;
  const openTodoCount = workspaceInformation.todos.filter(
    (todo) => !todo.completed,
  ).length;

  return (
    <div className="space-y-3">
      <Accordion
        type="multiple"
        value={openSections}
        onValueChange={(value) =>
          setOpenSections(value as WorkspaceInformationSectionId[])
        }
        className="space-y-3"
      >
        <WorkspaceInformationSection
          value="overview"
          title="Workspace information"
          icon={
            <SectionMark className="border-primary/20 bg-primary/10 text-primary">
              <Info className="size-4" />
            </SectionMark>
          }
          countLabel={formatCountLabel(totalConnections, "link", "links")}
          accent
        >
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Workspace
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {workspaceName}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  GitHub
                </p>
                {isDefaultWorkspace ? (
                  <p className="mt-1 text-sm font-medium text-foreground">
                    Default workspace
                  </p>
                ) : prInfo?.pr ? (
                  <div className="mt-1 flex items-center gap-2">
                    <PrStatusIcon status={prInfo.derived} className="size-4" />
                    <p className="text-sm font-medium text-foreground">
                      #{prInfo.pr.number}{" "}
                      {PR_STATUS_VISUAL[prInfo.derived].label}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-sm font-medium text-foreground">
                    No current branch PR
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-sm">
                {workspaceInformation.jiraIssues.length} Jira
              </Badge>
              <Badge variant="outline" className="rounded-sm">
                {workspaceInformation.figmaResources.length} Figma
              </Badge>
              <Badge variant="outline" className="rounded-sm">
                {workspaceInformation.linkedPullRequests.length +
                  currentBranchPrCount}{" "}
                GitHub
              </Badge>
              <Badge variant="outline" className="rounded-sm">
                {workspaceInformation.todos.length} Todos
              </Badge>
              <Badge variant="outline" className="rounded-sm">
                {workspaceInformation.customFields.length} Custom fields
              </Badge>
            </div>
          </div>
        </WorkspaceInformationSection>

        <WorkspaceInformationSection
          value="note"
          title="Note"
          icon={
            <SectionMark>
              <FileText className="size-4" />
            </SectionMark>
          }
          countLabel={workspaceInformation.notes.trim() ? "saved" : "empty"}
        >
          <Textarea
            className="min-h-28"
            value={workspaceInformation.notes}
            onChange={(event) =>
              patchWorkspaceInformation((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
            placeholder="Workspace note, blockers, or handoff details"
          />
        </WorkspaceInformationSection>

        <WorkspaceInformationSection
          value="todo"
          title="Todo"
          icon={
            <SectionMark>
              <ListTodo className="size-4" />
            </SectionMark>
          }
          countLabel={formatCountLabel(openTodoCount, "open", "open")}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              onClick={() =>
                patchWorkspaceInformation((current) => ({
                  ...current,
                  todos: [...current.todos, createWorkspaceTodoItem()],
                }))
              }
            >
              <Plus className="mr-1 size-4" />
              Add
            </Button>
          }
        >
          <div className="space-y-2">
            {workspaceInformation.todos.length === 0 ? (
              <p className="text-xs text-muted-foreground">No todos yet.</p>
            ) : null}
            {workspaceInformation.todos.map((todo) => (
              <div
                key={todo.id}
                className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/15 px-3 py-2"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 rounded-sm p-0",
                    todo.completed && "text-primary",
                  )}
                  onClick={() =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      todos: updateItemById(current.todos, todo.id, (item) => ({
                        ...item,
                        completed: !item.completed,
                      })),
                    }))
                  }
                  aria-label={
                    todo.completed
                      ? "Mark todo incomplete"
                      : "Mark todo complete"
                  }
                >
                  {todo.completed ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <Circle className="size-4" />
                  )}
                </Button>
                <Input
                  value={todo.text}
                  onChange={(event) =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      todos: updateItemById(current.todos, todo.id, (item) => ({
                        ...item,
                        text: event.target.value,
                      })),
                    }))
                  }
                  placeholder="Todo item"
                  className={cn(
                    todo.completed && "text-muted-foreground line-through",
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 rounded-sm p-0 text-muted-foreground"
                  onClick={() =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      todos: removeItemById(current.todos, todo.id),
                    }))
                  }
                  aria-label="Remove todo"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </WorkspaceInformationSection>

        <WorkspaceInformationSection
          value="jira"
          title="Jira"
          icon={<ServiceMark label="JR" />}
          countLabel={formatCountLabel(
            workspaceInformation.jiraIssues.length,
            "issue",
            "issues",
          )}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              onClick={() =>
                patchWorkspaceInformation((current) => ({
                  ...current,
                  jiraIssues: [
                    ...current.jiraIssues,
                    createWorkspaceJiraIssue(),
                  ],
                }))
              }
            >
              <Plus className="mr-1 size-4" />
              Add
            </Button>
          }
        >
          <div className="space-y-3">
            {workspaceInformation.jiraIssues.length === 0 ? (
              <p className="text-xs text-muted-foreground">No Jira links.</p>
            ) : null}
            {workspaceInformation.jiraIssues.map((issue) => {
              const issueRef = extractJiraIssueReference(issue.url);
              const issueKey =
                issue.issueKey.trim() || issueRef?.issueKey || "";
              const host =
                issueRef?.host || formatWorkspaceInfoHostLabel(issue.url);
              const title =
                issue.title.trim() || issueKey || "Linked Jira issue";

              if (!isWorkspaceInfoUrl(issue.url)) {
                return (
                  <ConnectionUrlEditor
                    key={issue.id}
                    icon={<ServiceMark label="JR" />}
                    url={issue.url}
                    placeholder="https://company.atlassian.net/browse/ABC-123"
                    onChange={(url) =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        jiraIssues: updateItemById(
                          current.jiraIssues,
                          issue.id,
                          (item) => {
                            const parsed = extractJiraIssueReference(url);
                            return {
                              ...item,
                              url,
                              issueKey: parsed?.issueKey ?? item.issueKey,
                            };
                          },
                        ),
                      }))
                    }
                    onRemove={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        jiraIssues: removeItemById(
                          current.jiraIssues,
                          issue.id,
                        ),
                      }))
                    }
                  />
                );
              }

              return (
                <IntegrationCard key={issue.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <ServiceMark label="JR" />
                        {issueKey ? (
                          <Badge variant="secondary" className="rounded-sm">
                            {issueKey}
                          </Badge>
                        ) : null}
                        {issue.status.trim() ? (
                          <Badge variant="outline" className="rounded-sm">
                            {issue.status.trim()}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm font-medium leading-5 text-foreground">
                        {title}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-sm p-0"
                        onClick={() => openExternalUrl(issue.url)}
                        aria-label="Open Jira issue"
                      >
                        <ExternalLink className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-sm p-0 text-muted-foreground"
                        onClick={() =>
                          patchWorkspaceInformation((current) => ({
                            ...current,
                            jiraIssues: removeItemById(
                              current.jiraIssues,
                              issue.id,
                            ),
                          }))
                        }
                        aria-label="Remove Jira issue"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {host ? (
                      <Badge
                        variant="outline"
                        className="rounded-sm font-normal"
                      >
                        {host}
                      </Badge>
                    ) : null}
                  </div>
                  {issue.note.trim() ? (
                    <p className="text-xs leading-5 text-muted-foreground whitespace-pre-wrap">
                      {issue.note.trim()}
                    </p>
                  ) : null}
                </IntegrationCard>
              );
            })}
          </div>
        </WorkspaceInformationSection>

        <WorkspaceInformationSection
          value="figma"
          title="Figma"
          icon={<ServiceMark label="FG" />}
          countLabel={formatCountLabel(
            workspaceInformation.figmaResources.length,
            "file",
            "files",
          )}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              onClick={() =>
                patchWorkspaceInformation((current) => ({
                  ...current,
                  figmaResources: [
                    ...current.figmaResources,
                    createWorkspaceFigmaResource(),
                  ],
                }))
              }
            >
              <Plus className="mr-1 size-4" />
              Add
            </Button>
          }
        >
          <div className="space-y-3">
            {workspaceInformation.figmaResources.length === 0 ? (
              <p className="text-xs text-muted-foreground">No Figma links.</p>
            ) : null}
            {workspaceInformation.figmaResources.map((resource) => {
              const figmaRef = extractFigmaResourceReference(resource.url);
              const title =
                resource.title.trim() ||
                figmaRef?.title ||
                "Linked Figma resource";
              const host =
                figmaRef?.host || formatWorkspaceInfoHostLabel(resource.url);
              const nodeId = resource.nodeId.trim() || figmaRef?.nodeId || "";

              if (!isWorkspaceInfoUrl(resource.url)) {
                return (
                  <ConnectionUrlEditor
                    key={resource.id}
                    icon={<ServiceMark label="FG" />}
                    url={resource.url}
                    placeholder="https://www.figma.com/file/..."
                    onChange={(url) =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        figmaResources: updateItemById(
                          current.figmaResources,
                          resource.id,
                          (item) => {
                            const parsed = extractFigmaResourceReference(url);
                            return {
                              ...item,
                              url,
                              title: parsed?.title || item.title,
                              nodeId: parsed?.nodeId ?? item.nodeId,
                            };
                          },
                        ),
                      }))
                    }
                    onRemove={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        figmaResources: removeItemById(
                          current.figmaResources,
                          resource.id,
                        ),
                      }))
                    }
                  />
                );
              }

              return (
                <IntegrationCard key={resource.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <ServiceMark label="FG" />
                        <Badge
                          variant="secondary"
                          className="rounded-sm capitalize"
                        >
                          {formatFigmaKindLabel(figmaRef?.kind)}
                        </Badge>
                        {nodeId ? (
                          <Badge variant="outline" className="rounded-sm">
                            node {nodeId}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm font-medium leading-5 text-foreground">
                        {title}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-sm p-0"
                        onClick={() => openExternalUrl(resource.url)}
                        aria-label="Open Figma resource"
                      >
                        <ExternalLink className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-sm p-0 text-muted-foreground"
                        onClick={() =>
                          patchWorkspaceInformation((current) => ({
                            ...current,
                            figmaResources: removeItemById(
                              current.figmaResources,
                              resource.id,
                            ),
                          }))
                        }
                        aria-label="Remove Figma resource"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {host ? (
                      <Badge
                        variant="outline"
                        className="rounded-sm font-normal"
                      >
                        {host}
                      </Badge>
                    ) : null}
                  </div>
                  {resource.note.trim() ? (
                    <p className="text-xs leading-5 text-muted-foreground whitespace-pre-wrap">
                      {resource.note.trim()}
                    </p>
                  ) : null}
                </IntegrationCard>
              );
            })}
          </div>
        </WorkspaceInformationSection>

        <WorkspaceInformationSection
          value="github"
          title="GitHub"
          icon={<ServiceMark label="GH" />}
          countLabel={formatCountLabel(
            workspaceInformation.linkedPullRequests.length +
              currentBranchPrCount,
            "item",
            "items",
          )}
          action={
            <div className="flex items-center gap-2">
              {!isDefaultWorkspace ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-sm"
                  onClick={() =>
                    void fetchWorkspacePrStatus({
                      workspaceId: activeWorkspaceId,
                    })
                  }
                >
                  <RefreshCcw className="mr-1 size-4" />
                  Refresh
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-sm"
                onClick={() =>
                  patchWorkspaceInformation((current) => ({
                    ...current,
                    linkedPullRequests: [
                      ...current.linkedPullRequests,
                      createWorkspaceLinkedPullRequest(),
                    ],
                  }))
                }
              >
                <Plus className="mr-1 size-4" />
                Add
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            {!isDefaultWorkspace && currentBranchPr ? (
              <IntegrationCard className="border-primary/15 bg-primary/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ServiceMark label="GH" />
                      <Badge variant="secondary" className="rounded-sm">
                        Current branch
                      </Badge>
                      {currentBranchPrStatus ? (
                        <PrStatusBadge status={currentBranchPrStatus} />
                      ) : null}
                    </div>
                    <p className="text-sm font-medium leading-5 text-foreground">
                      #{currentBranchPr.number} {currentBranchPr.title}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 rounded-sm p-0"
                    onClick={() => openExternalUrl(currentBranchPr.url)}
                    aria-label="Open pull request on GitHub"
                  >
                    <ExternalLink className="size-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-sm">
                    #{currentBranchPr.number}
                  </Badge>
                  <Badge variant="outline" className="rounded-sm">
                    {currentBranchPr.headRefName} →{" "}
                    {currentBranchPr.baseRefName}
                  </Badge>
                </div>
              </IntegrationCard>
            ) : !isDefaultWorkspace ? (
              <p className="text-xs text-muted-foreground">
                No current branch PR.
              </p>
            ) : null}

            {workspaceInformation.linkedPullRequests.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No related GitHub PRs.
              </p>
            ) : null}
            {workspaceInformation.linkedPullRequests.map((item) => {
              const githubRef = extractGitHubPullRequestReference(item.url);
              const preview = linkedPullRequestPreviewById[item.id];
              const previewInfo = preview?.info;
              const previewStatus = previewInfo?.derived;
              const title =
                previewInfo?.pr.title ||
                item.title.trim() ||
                (githubRef
                  ? `${githubRef.owner}/${githubRef.repo} #${githubRef.number}`
                  : "Linked GitHub PR");

              if (!isWorkspaceInfoUrl(item.url)) {
                return (
                  <ConnectionUrlEditor
                    key={item.id}
                    icon={<ServiceMark label="GH" />}
                    url={item.url}
                    placeholder="https://github.com/owner/repo/pull/123"
                    onChange={(url) =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        linkedPullRequests: updateItemById(
                          current.linkedPullRequests,
                          item.id,
                          (pullRequest) => ({
                            ...pullRequest,
                            url,
                          }),
                        ),
                      }))
                    }
                    onRemove={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        linkedPullRequests: removeItemById(
                          current.linkedPullRequests,
                          item.id,
                        ),
                      }))
                    }
                  />
                );
              }

              return (
                <IntegrationCard key={item.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <ServiceMark label="GH" />
                        <Badge variant="secondary" className="rounded-sm">
                          Related PR
                        </Badge>
                        {previewStatus ? (
                          <PrStatusBadge status={previewStatus} />
                        ) : preview?.loading ? (
                          <Badge variant="outline" className="rounded-sm">
                            Loading
                          </Badge>
                        ) : preview?.error ? (
                          <Badge variant="outline" className="rounded-sm">
                            Lookup unavailable
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm font-medium leading-5 text-foreground">
                        {title}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-sm p-0"
                        disabled={!githubRef}
                        onClick={() =>
                          void refreshLinkedPullRequestPreview({
                            itemId: item.id,
                            url: item.url.trim(),
                          })
                        }
                        aria-label="Refresh linked GitHub PR"
                      >
                        <RefreshCcw className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-sm p-0"
                        onClick={() => openExternalUrl(item.url)}
                        aria-label="Open linked GitHub PR"
                      >
                        <ExternalLink className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-sm p-0 text-muted-foreground"
                        onClick={() =>
                          patchWorkspaceInformation((current) => ({
                            ...current,
                            linkedPullRequests: removeItemById(
                              current.linkedPullRequests,
                              item.id,
                            ),
                          }))
                        }
                        aria-label="Remove linked GitHub PR"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {githubRef ? (
                      <>
                        <Badge variant="outline" className="rounded-sm">
                          #{githubRef.number}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-sm font-normal"
                        >
                          {githubRef.owner}/{githubRef.repo}
                        </Badge>
                      </>
                    ) : null}
                    {previewInfo?.pr.headRefName &&
                    previewInfo.pr.baseRefName ? (
                      <Badge variant="outline" className="rounded-sm">
                        {previewInfo.pr.headRefName} →{" "}
                        {previewInfo.pr.baseRefName}
                      </Badge>
                    ) : null}
                  </div>

                  {preview?.error ? (
                    <p className="text-xs text-muted-foreground">
                      {preview.error}
                    </p>
                  ) : null}
                </IntegrationCard>
              );
            })}
          </div>
        </WorkspaceInformationSection>

        <WorkspaceInformationSection
          value="custom"
          title="Custom fields"
          icon={
            <SectionMark>
              <Box className="size-4" />
            </SectionMark>
          }
          countLabel={formatCountLabel(
            workspaceInformation.customFields.length,
            "field",
            "fields",
          )}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              onClick={() =>
                patchWorkspaceInformation((current) => ({
                  ...current,
                  customFields: [
                    ...current.customFields,
                    createWorkspaceInfoCustomField(),
                  ],
                }))
              }
            >
              <Plus className="mr-1 size-4" />
              Add
            </Button>
          }
        >
          <div className="space-y-3">
            {workspaceInformation.customFields.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No custom fields yet.
              </p>
            ) : null}
            {workspaceInformation.customFields.map((field) => (
              <div
                key={field.id}
                className="space-y-2 rounded-lg border border-border/70 bg-muted/15 p-3"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_11rem_auto] gap-2">
                  <Input
                    value={field.label}
                    onChange={(event) =>
                      patchCustomField(field.id, (currentField) => ({
                        ...currentField,
                        label: event.target.value,
                      }))
                    }
                    placeholder="Field label"
                  />
                  <Select
                    value={field.type}
                    onValueChange={(value) =>
                      patchCustomField(field.id, (currentField) =>
                        changeWorkspaceInfoCustomFieldType({
                          field: currentField,
                          type: value as WorkspaceInfoFieldType,
                        }),
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Field type" />
                    </SelectTrigger>
                    <SelectContent>
                      {WORKSPACE_INFO_FIELD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 rounded-sm p-0 text-muted-foreground"
                    onClick={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        customFields: removeItemById(
                          current.customFields,
                          field.id,
                        ),
                      }))
                    }
                    aria-label="Remove custom field"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {renderCustomFieldInput({
                  field,
                  onFieldChange: (nextField) =>
                    patchCustomField(field.id, () => nextField),
                })}
              </div>
            ))}
          </div>
        </WorkspaceInformationSection>
      </Accordion>
    </div>
  );
}
