export const WORKSPACE_INFO_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "boolean",
  "date",
  "url",
  "single_select",
] as const;

export type WorkspaceInfoFieldType = typeof WORKSPACE_INFO_FIELD_TYPES[number];

export const WORKSPACE_LINKED_PR_STATUSES = [
  "planned",
  "open",
  "review",
  "merged",
  "closed",
] as const;

export type WorkspaceLinkedPrStatus = typeof WORKSPACE_LINKED_PR_STATUSES[number];

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
    .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
}

export function isWorkspaceInfoUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
  const nextValue = options.includes(args.field.value) ? args.field.value : (options[0] ?? "");

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
