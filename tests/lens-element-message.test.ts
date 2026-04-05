import { describe, expect, it } from "bun:test";
import { formatElementForChat } from "@/lib/lens/lens-element-message";
import type { ElementPickerResult } from "@/lib/lens/lens.types";

const baseResult: ElementPickerResult = {
  selector: "#hero > button:nth-child(1)",
  tagName: "button",
  id: "launch-cta",
  classList: ["ButtonRoot", "hero-button", "primary"],
  boundingBox: { x: 32, y: 64, width: 180, height: 44 },
  computedStyles: {
    color: "rgb(255, 255, 255)",
    backgroundColor: "rgb(0, 128, 96)",
    fontSize: "14px",
    display: "inline-flex",
    position: "relative",
  },
  outerHTML: '<button id="launch-cta" class="ButtonRoot hero-button primary">Launch</button>',
  textContent: "Launch",
  debugSource: {
    fileName: "src/components/Hero.tsx",
    lineNumber: 28,
    columnNumber: 7,
  },
};

describe("formatElementForChat", () => {
  it("includes heuristic source hints by default", () => {
    const text = formatElementForChat(baseResult);

    expect(text).toContain("[Lens Element Selection]");
    expect(text).toContain("Source search hints");
    expect(text).toContain('Search text: `"Launch"`');
    expect(text).toContain("Likely component class");
  });

  it("omits heuristic hints when disabled", () => {
    const text = formatElementForChat(baseResult, {
      heuristic: false,
      reactDebugSource: false,
    });

    expect(text).not.toContain("Source search hints");
    expect(text).not.toContain("React source:");
  });

  it("includes React debug source when enabled", () => {
    const text = formatElementForChat(baseResult, {
      heuristic: true,
      reactDebugSource: true,
    });

    expect(text).toContain("React source:");
    expect(text).toContain("src/components/Hero.tsx:28:7");
  });
});
