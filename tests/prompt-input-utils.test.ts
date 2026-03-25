import { describe, expect, test } from "bun:test";
import { getAcceptedCommandPaletteItem, getNextCommandSelectionIndex, NO_COMMAND_SELECTION } from "@/components/ai-elements/prompt-input.utils";
import type { CommandPaletteItem } from "@/lib/commands";

const items: CommandPaletteItem[] = [
  {
    id: "status",
    command: "/stave:status",
    insertText: "/stave:status",
    description: "Show workspace status.",
    source: "stave_builtin",
  },
  {
    id: "usage",
    command: "/stave:usage",
    insertText: "/stave:usage",
    description: "Show token usage.",
    source: "stave_builtin",
  },
];

describe("getNextCommandSelectionIndex", () => {
  test("starts from the first item when moving down from no selection", () => {
    expect(getNextCommandSelectionIndex({
      currentIndex: NO_COMMAND_SELECTION,
      itemCount: items.length,
      direction: "next",
    })).toBe(0);
  });

  test("starts from the last item when moving up from no selection", () => {
    expect(getNextCommandSelectionIndex({
      currentIndex: NO_COMMAND_SELECTION,
      itemCount: items.length,
      direction: "previous",
    })).toBe(1);
  });
});

describe("getAcceptedCommandPaletteItem", () => {
  test("accepts the first match on Enter even without an explicit selection", () => {
    expect(getAcceptedCommandPaletteItem({
      items,
      selectedIndex: NO_COMMAND_SELECTION,
      triggerKey: "Enter",
    })).toEqual(items[0]);
  });

  test("accepts the first match on Tab even without an explicit selection", () => {
    expect(getAcceptedCommandPaletteItem({
      items,
      selectedIndex: NO_COMMAND_SELECTION,
      triggerKey: "Tab",
    })).toEqual(items[0]);
  });

  test("accepts the highlighted item on Enter after explicit selection", () => {
    expect(getAcceptedCommandPaletteItem({
      items,
      selectedIndex: 1,
      triggerKey: "Enter",
    })).toEqual(items[1]);
  });
});
