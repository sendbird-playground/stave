import { describe, expect, test } from "bun:test";
import { resolveHostServiceScriptPath } from "../electron/main/host-service-client";

describe("resolveHostServiceScriptPath", () => {
  test("uses the sibling file when the bundled main entry owns the client", () => {
    expect(
      resolveHostServiceScriptPath({
        moduleUrl: "file:///tmp/stave/out/main/index.js",
        pathExists: (candidate) => candidate === "/tmp/stave/out/main/host-service.js",
      }),
    ).toBe("/tmp/stave/out/main/host-service.js");
  });

  test("falls back to the parent directory when the client lives in a chunk", () => {
    expect(
      resolveHostServiceScriptPath({
        moduleUrl: "file:///tmp/stave/out/main/chunks/index-ABCD.js",
        pathExists: (candidate) => candidate === "/tmp/stave/out/main/host-service.js",
      }),
    ).toBe("/tmp/stave/out/main/host-service.js");
  });
});
