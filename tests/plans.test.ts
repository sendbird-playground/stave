import { describe, expect, test } from "bun:test";
import {
  buildWorkspacePlanFilePath,
  isWorkspacePlanFilePath,
  parseWorkspacePlanFilePath,
  sortWorkspacePlansNewestFirst,
} from "@/lib/plans";
import { hasMeaningfulPlanText, normalizePlanText } from "@/lib/plan-text";

describe("workspace plans helpers", () => {
  test("writes new plans into the workspace context plans directory", () => {
    const filePath = buildWorkspacePlanFilePath({
      taskId: "12345678-aaaa-bbbb-cccc-1234567890ab",
      createdAt: new Date("2026-04-01T01:02:03.000Z"),
    });

    expect(filePath).toBe(".stave/context/plans/12345678_2026-04-01T01-02-03.md");
  });

  test("recognizes both current and legacy plan file paths", () => {
    expect(isWorkspacePlanFilePath(".stave/context/plans/abcd1234_2026-04-01T01-02-03.md")).toBe(true);
    expect(isWorkspacePlanFilePath(".stave/plans/abcd1234_2026-04-01T01-02-03.md")).toBe(true);
    expect(isWorkspacePlanFilePath(".stave/context/notes.md")).toBe(false);
  });

  test("parses and sorts plan entries newest-first", () => {
    const older = parseWorkspacePlanFilePath(".stave/plans/abcd1234_2026-03-30T01-02-03.md");
    const newer = parseWorkspacePlanFilePath(".stave/context/plans/abcd1234_2026-04-01T04-05-06.md");

    expect(sortWorkspacePlansNewestFirst([older, newer]).map((entry) => entry.filePath)).toEqual([
      newer.filePath,
      older.filePath,
    ]);
    expect(newer.label).toBe("2026-04-01 04:05:06");
  });

  test("strips leading commentary before a structured plan block", () => {
    expect(normalizePlanText(
      "I think this approach is safest.\n\n## Plan\n1. Inspect the parser\n2. Patch the write path",
    )).toBe("## Plan\n1. Inspect the parser\n2. Patch the write path");
  });

  test("strips trailing sign-off commentary after a structured plan block", () => {
    expect(normalizePlanText(
      "## Plan\n- Reproduce the issue\n- Save only normalized output\n\nLet me know if you want me to revise it.",
    )).toBe("## Plan\n- Reproduce the issue\n- Save only normalized output");
  });

  test("extracts only the tagged proposed plan content", () => {
    expect(normalizePlanText(
      "Some analysis\n<proposed_plan>\n## Plan\n- Ship the fix\n</proposed_plan>\nIf you'd like, I can refine it further.",
    )).toBe("## Plan\n- Ship the fix");
  });

  test("keeps unstructured multiline plans intact when no structured block exists", () => {
    expect(normalizePlanText(
      "Inspect the current output.\nPatch the persistence layer.\nRun the focused tests.",
    )).toBe("Inspect the current output.\nPatch the persistence layer.\nRun the focused tests.");
  });

  test("does not treat ellipsis-only placeholder text as a meaningful plan", () => {
    expect(hasMeaningfulPlanText("...")).toBe(false);
    expect(hasMeaningfulPlanText("…")).toBe(false);
  });
});
