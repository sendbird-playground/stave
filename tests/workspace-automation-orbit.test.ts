import { describe, expect, test } from "bun:test";
import {
  ORBIT_URL_MARKER,
  buildOrbitCommand,
  extractOrbitOutput,
  sanitizeOrbitName,
} from "../electron/main/workspace-scripts/orbit";

describe("sanitizeOrbitName", () => {
  test("normalizes arbitrary labels into host-safe names", () => {
    expect(sanitizeOrbitName("Agentize UI")).toBe("agentize-ui");
    expect(sanitizeOrbitName("...")).toBe("app");
  });
});

describe("buildOrbitCommand", () => {
  test("wraps commands with portless and preserves overrides", () => {
    const command = buildOrbitCommand({
      command: "bun run dev -- --mode local",
      defaultName: "stave",
      portlessCommand: "/tmp/portless",
      orbit: {
        name: "Stave Desktop",
        noTls: true,
        proxyPort: 1355,
      },
    });

    expect(command).toContain("'/tmp/portless' run --no-tls -p 1355 --name 'stave-desktop'");
    expect(command).toContain(ORBIT_URL_MARKER);
    expect(command).toContain("\"$PORTLESS_URL\"");
    expect(command).toContain("bun run dev -- --mode local");
  });
});

describe("extractOrbitOutput", () => {
  test("extracts orbit URL markers and preserves normal output", () => {
    const first = extractOrbitOutput({
      buffer: "",
      chunk: `${ORBIT_URL_MARKER}https://fix-ui.stave.localhost\nready\npart`,
    });
    expect(first.orbitUrls).toEqual(["https://fix-ui.stave.localhost"]);
    expect(first.output).toBe("ready\n");
    expect(first.buffer).toBe("part");

    const second = extractOrbitOutput({
      buffer: first.buffer,
      chunk: "ial\n",
    });
    expect(second.orbitUrls).toEqual([]);
    expect(second.output).toBe("partial\n");
    expect(second.buffer).toBe("");
  });
});
