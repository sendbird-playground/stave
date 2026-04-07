import { describe, expect, test } from "bun:test";
import { UI_LAYER_CLASS, UI_LAYER_VALUE } from "@/lib/ui-layers";

describe("ui layer ordering", () => {
  test("keeps resize handles below overlays and popovers", () => {
    expect(UI_LAYER_VALUE.resizer).toBeLessThan(UI_LAYER_VALUE.dialog);
    expect(UI_LAYER_VALUE.dialog).toBeLessThan(UI_LAYER_VALUE.popover);
    expect(UI_LAYER_VALUE.popover).toBeLessThan(UI_LAYER_VALUE.lightbox);
  });

  test("keeps muse above chrome but below modal surfaces", () => {
    expect(UI_LAYER_VALUE.chrome).toBeLessThan(UI_LAYER_VALUE.muse);
    expect(UI_LAYER_VALUE.muse).toBeLessThan(UI_LAYER_VALUE.dialog);
  });

  test("exposes stable class names for shared surfaces", () => {
    expect(UI_LAYER_CLASS.resizer).toBe("z-20");
    expect(UI_LAYER_CLASS.dialog).toBe("z-[80]");
    expect(UI_LAYER_CLASS.popover).toBe("z-[90]");
    expect(UI_LAYER_CLASS.lightbox).toBe("z-[100]");
  });
});
