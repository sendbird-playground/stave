export const WORKSPACE_INFO_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "boolean",
  "date",
  "url",
  "single_select",
] as const;

export type WorkspaceInfoFieldType =
  (typeof WORKSPACE_INFO_FIELD_TYPES)[number];

export const WORKSPACE_LINKED_PR_STATUSES = [
  "planned",
  "open",
  "review",
  "merged",
  "closed",
] as const;

export type WorkspaceLinkedPrStatus =
  (typeof WORKSPACE_LINKED_PR_STATUSES)[number];

export interface GitHubPullRequestReference {
  owner: string;
  repo: string;
  number: number;
}

export interface JiraIssueReference {
  host: string;
  issueKey: string;
}

export type FigmaResourceKind =
  | "file"
  | "design"
  | "proto"
  | "board"
  | "slides"
  | "unknown";

export interface FigmaResourceReference {
  host: string;
  kind: FigmaResourceKind;
  fileKey: string;
  title: string;
  nodeId: string | null;
}

export interface WorkspaceJiraIssue {
  id: string;
  issueKey: string;
  title: string;
  url: string;
  status: string;
  note: string;
}

export interface WorkspaceFigmaResource {
  id: string;
  title: string;
  url: string;
  nodeId: string;
  note: string;
}

export interface WorkspaceLinkedPullRequest {
  id: string;
  title: string;
  url: string;
  status: WorkspaceLinkedPrStatus;
  note: string;
}

export interface WorkspaceTodoItem {
  id: string;
  text: string;
  completed: boolean;
}

interface WorkspaceInfoFieldBase {
  id: string;
  label: string;
}

export interface WorkspaceTextField extends WorkspaceInfoFieldBase {
  type: "text";
  value: string;
}

export interface WorkspaceTextareaField extends WorkspaceInfoFieldBase {
  type: "textarea";
  value: string;
}

export interface WorkspaceNumberField extends WorkspaceInfoFieldBase {
  type: "number";
  value: number | null;
}

export interface WorkspaceBooleanField extends WorkspaceInfoFieldBase {
  type: "boolean";
  value: boolean;
}

export interface WorkspaceDateField extends WorkspaceInfoFieldBase {
  type: "date";
  value: string;
}

export interface WorkspaceUrlField extends WorkspaceInfoFieldBase {
  type: "url";
  value: string;
}

export interface WorkspaceSingleSelectField extends WorkspaceInfoFieldBase {
  type: "single_select";
  value: string;
  options: string[];
}

export type WorkspaceInfoCustomField =
  | WorkspaceTextField
  | WorkspaceTextareaField
  | WorkspaceNumberField
  | WorkspaceBooleanField
  | WorkspaceDateField
  | WorkspaceUrlField
  | WorkspaceSingleSelectField;

export interface WorkspaceInformationState {
  jiraIssues: WorkspaceJiraIssue[];
  figmaResources: WorkspaceFigmaResource[];
  linkedPullRequests: WorkspaceLinkedPullRequest[];
  notes: string;
  todos: WorkspaceTodoItem[];
  customFields: WorkspaceInfoCustomField[];
}

function buildWorkspaceInformationId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createWorkspaceJiraIssue(): WorkspaceJiraIssue {
  return {
    id: buildWorkspaceInformationId("jira"),
    issueKey: "",
    title: "",
    url: "",
    status: "",
    note: "",
  };
}

export function createWorkspaceFigmaResource(): WorkspaceFigmaResource {
  return {
    id: buildWorkspaceInformationId("figma"),
    title: "",
    url: "",
    nodeId: "",
    note: "",
  };
}

export function createWorkspaceLinkedPullRequest(): WorkspaceLinkedPullRequest {
  return {
    id: buildWorkspaceInformationId("pr"),
    title: "",
    url: "",
    status: "planned",
    note: "",
  };
}

export function createWorkspaceTodoItem(): WorkspaceTodoItem {
  return {
    id: buildWorkspaceInformationId("todo"),
    text: "",
    completed: false,
  };
}

export function parseWorkspaceInfoOptions(rawValue: string) {
  return rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(
      (item, index, array) => item.length > 0 && array.indexOf(item) === index,
    );
}

function parseWorkspaceInfoUrl(value: string) {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

export function isWorkspaceInfoUrl(value: string) {
  const url = parseWorkspaceInfoUrl(value);
  if (!url) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

export function formatWorkspaceInfoHostLabel(value: string) {
  const url = parseWorkspaceInfoUrl(value);
  if (!url) {
    return "";
  }
  return url.hostname.replace(/^www\./, "");
}

export function extractGitHubPullRequestReference(
  value: string,
): GitHubPullRequestReference | null {
  const url = parseWorkspaceInfoUrl(value);
  if (!url || url.hostname.replace(/^www\./, "") !== "github.com") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if ((segments[2] ?? "") !== "pull") {
    return null;
  }

  const owner = segments[0] ?? "";
  const repo = segments[1] ?? "";
  const number = Number.parseInt(segments[3] ?? "", 10);
  if (!owner || !repo || !Number.isInteger(number) || number < 1) {
    return null;
  }

  return { owner, repo, number };
}

export function isGitHubPullRequestUrl(value: string) {
  return extractGitHubPullRequestReference(value) !== null;
}

export function extractJiraIssueReference(
  value: string,
): JiraIssueReference | null {
  const url = parseWorkspaceInfoUrl(value);
  if (!url) {
    return null;
  }

  const match =
    `${decodeURIComponent(url.pathname)} ${decodeURIComponent(url.search)}`.match(
      /\b([A-Z][A-Z0-9]+-\d+)\b/,
    );
  const issueKey = match?.[1]?.trim();
  if (!issueKey) {
    return null;
  }

  return {
    host: formatWorkspaceInfoHostLabel(value),
    issueKey,
  };
}

export function extractFigmaResourceReference(
  value: string,
): FigmaResourceReference | null {
  const url = parseWorkspaceInfoUrl(value);
  if (!url || url.hostname.replace(/^www\./, "") !== "figma.com") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const rawKind = segments[0] ?? "";
  const kind: FigmaResourceKind =
    rawKind === "file" ||
    rawKind === "design" ||
    rawKind === "proto" ||
    rawKind === "board" ||
    rawKind === "slides"
      ? rawKind
      : "unknown";
  const fileKey = segments[1] ?? "";
  if (!fileKey) {
    return null;
  }

  const title = decodeURIComponent(segments[2] ?? "")
    .replace(/[-_]+/g, " ")
    .trim();
  const nodeId = url.searchParams.get("node-id")?.trim() || null;

  return {
    host: formatWorkspaceInfoHostLabel(value),
    kind,
    fileKey,
    title,
    nodeId,
  };
}

export function createWorkspaceInfoCustomField(args?: {
  type?: WorkspaceInfoFieldType;
  label?: string;
}): WorkspaceInfoCustomField {
  const type = args?.type ?? "text";
  const label = args?.label?.trim() ?? "";
  const id = buildWorkspaceInformationId("field");

  switch (type) {
    case "textarea":
      return { id, label, type, value: "" };
    case "number":
      return { id, label, type, value: null };
    case "boolean":
      return { id, label, type, value: false };
    case "date":
      return { id, label, type, value: "" };
    case "url":
      return { id, label, type, value: "" };
    case "single_select":
      return { id, label, type, value: "", options: [] };
    case "text":
    default:
      return { id, label, type: "text", value: "" };
  }
}

export function changeWorkspaceInfoCustomFieldType(args: {
  field: WorkspaceInfoCustomField;
  type: WorkspaceInfoFieldType;
}): WorkspaceInfoCustomField {
  const { field, type } = args;
  const nextField = createWorkspaceInfoCustomField({
    type,
    label: field.label,
  });

  return {
    ...nextField,
    id: field.id,
  };
}

export function updateWorkspaceInfoSelectFieldOptions(args: {
  field: WorkspaceSingleSelectField;
  rawValue: string;
}): WorkspaceSingleSelectField {
  const options = parseWorkspaceInfoOptions(args.rawValue);
  const nextValue = options.includes(args.field.value)
    ? args.field.value
    : (options[0] ?? "");

  return {
    ...args.field,
    options,
    value: nextValue,
  };
}

export function createEmptyWorkspaceInformation(): WorkspaceInformationState {
  return {
    jiraIssues: [],
    figmaResources: [],
    linkedPullRequests: [],
    notes: "",
    todos: [],
    customFields: [],
  };
}
