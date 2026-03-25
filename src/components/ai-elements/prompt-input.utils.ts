import type { CommandPaletteItem } from "@/lib/commands";

export const NO_COMMAND_SELECTION = -1;

export function getNextCommandSelectionIndex(args: {
  currentIndex: number;
  itemCount: number;
  direction: "next" | "previous";
}) {
  const { currentIndex, itemCount, direction } = args;
  if (itemCount <= 0) {
    return NO_COMMAND_SELECTION;
  }
  if (currentIndex === NO_COMMAND_SELECTION) {
    return direction === "next" ? 0 : itemCount - 1;
  }
  if (direction === "next") {
    return (currentIndex + 1) % itemCount;
  }
  return (currentIndex - 1 + itemCount) % itemCount;
}

export function getAcceptedCommandPaletteItem(args: {
  items: readonly CommandPaletteItem[];
  selectedIndex: number;
  triggerKey: "Enter" | "Tab";
}) {
  return getAcceptedPaletteItem(args);
}

export function getAcceptedPaletteItem<T>(args: {
  items: readonly T[];
  selectedIndex: number;
  triggerKey: "Enter" | "Tab";
}) {
  const { items, selectedIndex } = args;
  if (items.length === 0) {
    return null;
  }
  return items[selectedIndex] ?? items[0] ?? null;
}
