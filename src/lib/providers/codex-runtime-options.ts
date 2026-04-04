import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";

export type CodexApprovalPolicy = NonNullable<ProviderRuntimeOptions["codexApprovalPolicy"]>;
export type CodexSandboxMode = NonNullable<ProviderRuntimeOptions["codexSandboxMode"]>;

export function resolveEffectiveCodexApprovalPolicy(args: {
  approvalPolicy?: ProviderRuntimeOptions["codexApprovalPolicy"];
  planMode?: boolean;
  fallback?: CodexApprovalPolicy;
}): CodexApprovalPolicy {
  if (args.planMode) {
    return "never";
  }

  // "on-failure" is deprecated — normalize to "on-request" for backward compat.
  if (args.approvalPolicy === "on-failure") {
    return "on-request";
  }

  if (
    args.approvalPolicy === "never"
    || args.approvalPolicy === "on-request"
    || args.approvalPolicy === "untrusted"
  ) {
    return args.approvalPolicy;
  }

  return args.fallback ?? "on-request";
}

export function resolveEffectiveCodexSandboxMode(args: {
  sandboxMode?: ProviderRuntimeOptions["codexSandboxMode"];
  planMode?: boolean;
  fallback?: CodexSandboxMode;
}): CodexSandboxMode {
  if (args.planMode) {
    return "read-only";
  }

  if (
    args.sandboxMode === "read-only"
    || args.sandboxMode === "workspace-write"
    || args.sandboxMode === "danger-full-access"
  ) {
    return args.sandboxMode;
  }

  return args.fallback ?? "workspace-write";
}
