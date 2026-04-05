import { describe, expect, test } from "bun:test";
import {
  resolveEffectiveCodexApprovalPolicy,
  resolveEffectiveCodexSandboxMode,
} from "@/lib/providers/codex-runtime-options";

describe("resolveEffectiveCodexSandboxMode", () => {
  test("forces read-only sandbox while Codex plan mode is enabled", () => {
    expect(resolveEffectiveCodexSandboxMode({
      sandboxMode: "danger-full-access",
      planMode: true,
    })).toBe("read-only");
  });

  test("preserves the configured sandbox when Codex plan mode is disabled", () => {
    expect(resolveEffectiveCodexSandboxMode({
      sandboxMode: "workspace-write",
      planMode: false,
    })).toBe("workspace-write");
  });
});

describe("resolveEffectiveCodexApprovalPolicy", () => {
  test("forces never while Codex plan mode is enabled", () => {
    expect(resolveEffectiveCodexApprovalPolicy({
      approvalPolicy: "on-request",
      planMode: true,
    })).toBe("never");
  });

  test("preserves the configured approval policy when Codex plan mode is disabled", () => {
    expect(resolveEffectiveCodexApprovalPolicy({
      approvalPolicy: "untrusted",
      planMode: false,
    })).toBe("untrusted");
  });

  test("normalizes deprecated on-failure inputs to on-request", () => {
    expect(resolveEffectiveCodexApprovalPolicy({
      approvalPolicy: "on-failure",
      planMode: false,
    })).toBe("on-request");
  });
});
