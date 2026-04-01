import { expect, test } from "bun:test";
import {
  changeWorkspaceInfoCustomFieldType,
  createEmptyWorkspaceInformation,
  createWorkspaceInfoCustomField,
  isWorkspaceInfoUrl,
  updateWorkspaceInfoSelectFieldOptions,
} from "@/lib/workspace-information";

test("createEmptyWorkspaceInformation returns empty defaults", () => {
  expect(createEmptyWorkspaceInformation()).toEqual({
    jiraIssues: [],
    figmaResources: [],
    linkedPullRequests: [],
    notes: "",
    todos: [],
    customFields: [],
  });
});

test("changeWorkspaceInfoCustomFieldType preserves id and label while resetting value", () => {
  const textField = createWorkspaceInfoCustomField({ type: "text", label: "Owner" });
  const nextField = changeWorkspaceInfoCustomFieldType({
    field: {
      ...textField,
      value: "Platform",
    },
    type: "boolean",
  });

  expect(nextField).toEqual({
    id: textField.id,
    label: "Owner",
    type: "boolean",
    value: false,
  });
});

test("updateWorkspaceInfoSelectFieldOptions deduplicates options and resets stale value", () => {
  const field = {
    ...createWorkspaceInfoCustomField({ type: "single_select", label: "Stage" }),
    options: ["design", "review"],
    value: "review",
  };

  const nextField = updateWorkspaceInfoSelectFieldOptions({
    field,
    rawValue: "design, qa, qa, release",
  });

  expect(nextField.options).toEqual(["design", "qa", "release"]);
  expect(nextField.value).toBe("design");
});

test("isWorkspaceInfoUrl accepts only http and https urls", () => {
  expect(isWorkspaceInfoUrl("https://example.com")).toBe(true);
  expect(isWorkspaceInfoUrl("http://example.com/path")).toBe(true);
  expect(isWorkspaceInfoUrl("ftp://example.com")).toBe(false);
  expect(isWorkspaceInfoUrl("not a url")).toBe(false);
});
