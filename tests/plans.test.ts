import { describe, expect, test } from "bun:test";
import {
  buildWorkspacePlanFilePath,
  isWorkspacePlanFilePath,
  parseWorkspacePlanFilePath,
  sortWorkspacePlansNewestFirst,
} from "@/lib/plans";

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
});
