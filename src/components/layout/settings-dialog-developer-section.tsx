import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui";
import type { ClaudeContextUsageSnapshot, ClaudePluginReloadSnapshot } from "@/lib/providers/provider.types";
import { formatClaudeSettingSources, formatTokenBudget } from "@/lib/providers/runtime-option-contract";
import { useAppStore } from "@/store/app.store";
import { buildProviderRuntimeOptions } from "@/store/provider-runtime-options";
import {
  ChoiceButtons,
  DraftInput,
  SectionHeading,
  SectionStack,
  SettingsCard,
} from "./settings-dialog.shared";

interface GpuStatusSnapshot {
  hardwareAccelerationEnabled: boolean;
  featureStatus: Record<string, string>;
}

export function DeveloperSection() {
  const [
    settings,
    activeTaskId,
    activeWorkspaceId,
    workspacePathById,
    projectPath,
    providerConversationByTask,
    refreshProviderCommandCatalog,
  ] = useAppStore(useShallow((state) => [
    state.settings,
    state.activeTaskId,
    state.activeWorkspaceId,
    state.workspacePathById,
    state.projectPath,
    state.providerConversationByTask,
    state.refreshProviderCommandCatalog,
  ] as const));
  const [gpuStatus, setGpuStatus] = useState<GpuStatusSnapshot | null>(null);
  const [gpuStatusError, setGpuStatusError] = useState("");
  const [claudeContextUsage, setClaudeContextUsage] = useState<ClaudeContextUsageSnapshot | null>(null);
  const [claudeContextUsageDetail, setClaudeContextUsageDetail] = useState("");
  const [claudePluginReload, setClaudePluginReload] = useState<ClaudePluginReloadSnapshot | null>(null);
  const [claudePluginReloadDetail, setClaudePluginReloadDetail] = useState("");
  const [isLoadingClaudeContextUsage, setIsLoadingClaudeContextUsage] = useState(false);
  const [isReloadingClaudePlugins, setIsReloadingClaudePlugins] = useState(false);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const gpuStatusRows = gpuStatus ? Object.entries(gpuStatus.featureStatus).sort(([left], [right]) => left.localeCompare(right)) : [];
  const workspaceCwd = workspacePathById[activeWorkspaceId] ?? projectPath ?? undefined;
  const claudeRuntimeOptions = buildProviderRuntimeOptions({
    provider: "claude-code",
    model: settings.modelClaude,
    settings,
    providerConversation: activeTaskId
      ? (providerConversationByTask[activeTaskId] ?? null)
      : null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadGpuStatus() {
      const getGpuStatus = window.api?.window?.getGpuStatus;
      if (!getGpuStatus) {
        if (!cancelled) {
          setGpuStatusError("GPU status API unavailable.");
        }
        return;
      }

      try {
        const nextStatus = await getGpuStatus();
        if (cancelled) {
          return;
        }
        setGpuStatus(nextStatus);
        setGpuStatusError("");
      } catch (error) {
        if (cancelled) {
          return;
        }
        setGpuStatusError(error instanceof Error ? error.message : "Failed to load GPU status.");
      }
    }

    void loadGpuStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLoadClaudeContextUsage() {
    const getClaudeContextUsage = window.api?.provider?.getClaudeContextUsage;
    if (!getClaudeContextUsage) {
      setClaudeContextUsage(null);
      setClaudeContextUsageDetail("Claude context usage API unavailable.");
      return;
    }

    setIsLoadingClaudeContextUsage(true);
    try {
      const result = await getClaudeContextUsage({
        cwd: workspaceCwd,
        runtimeOptions: claudeRuntimeOptions,
      });
      setClaudeContextUsage(result.ok ? (result.usage ?? null) : null);
      setClaudeContextUsageDetail(result.detail);
    } catch (error) {
      setClaudeContextUsage(null);
      setClaudeContextUsageDetail(error instanceof Error ? error.message : "Failed to load Claude context usage.");
    } finally {
      setIsLoadingClaudeContextUsage(false);
    }
  }

  async function handleReloadClaudePlugins() {
    const reloadClaudePlugins = window.api?.provider?.reloadClaudePlugins;
    if (!reloadClaudePlugins) {
      setClaudePluginReload(null);
      setClaudePluginReloadDetail("Claude plugin reload API unavailable.");
      return;
    }

    setIsReloadingClaudePlugins(true);
    try {
      const result = await reloadClaudePlugins({
        cwd: workspaceCwd,
        runtimeOptions: claudeRuntimeOptions,
      });
      setClaudePluginReload(result.ok ? (result.reload ?? null) : null);
      setClaudePluginReloadDetail(result.detail);
      if (result.ok) {
        refreshProviderCommandCatalog();
      }
    } catch (error) {
      setClaudePluginReload(null);
      setClaudePluginReloadDetail(error instanceof Error ? error.message : "Failed to reload Claude plugins.");
    } finally {
      setIsReloadingClaudePlugins(false);
    }
  }

  return (
    <>
      <SectionHeading title="Developer" description="Advanced diagnostics and local provider tooling overrides." />
      <SectionStack>
        <SettingsCard title="Codex Binary Path" description="Override the path to the local `codex` binary. Leave empty to use the system install discovered from your PATH/home bin locations.">
          <DraftInput
            className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
            placeholder="/usr/local/bin/codex"
            value={settings.codexPathOverride}
            onCommit={(nextValue) => updateSettings({ patch: { codexPathOverride: nextValue } })}
          />
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <TriangleAlert className="size-4 text-warning" />
              Supported Codex baseline
            </p>
            <p className="mt-1">
              Stave targets Codex SDK `0.117.0` and expects a local `codex` CLI around `0.117.0`.
              If your installed CLI is older, update it or point this field at the version you want Stave to use.
            </p>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Claude Runtime Tools"
          description="Inspect current Claude session/workspace context pressure and refresh plugin-driven commands without leaving Stave."
        >
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-9"
              variant="outline"
              disabled={isLoadingClaudeContextUsage}
              onClick={() => void handleLoadClaudeContextUsage()}
            >
              {isLoadingClaudeContextUsage ? "Loading Context..." : "Inspect Context Usage"}
            </Button>
            <Button
              className="h-9"
              disabled={isReloadingClaudePlugins}
              onClick={() => void handleReloadClaudePlugins()}
            >
              {isReloadingClaudePlugins ? "Reloading Plugins..." : "Reload Plugins"}
            </Button>
          </div>

          <div className="space-y-1 rounded-md border border-border/80 bg-background px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Workspace</span>
              <span className="font-mono text-foreground">{workspaceCwd ?? "<process cwd>"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Setting Sources</span>
              <span className="font-mono text-foreground">{formatClaudeSettingSources(settings.claudeSettingSources)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Task Budget</span>
              <span className="font-mono text-foreground">{formatTokenBudget(settings.claudeTaskBudgetTokens)}</span>
            </div>
          </div>

          {claudeContextUsage ? (
            <div className="space-y-2 rounded-md border border-border/80 bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">Context usage</span>
                <span className="font-mono text-muted-foreground">
                  {claudeContextUsage.totalTokens.toLocaleString()} / {claudeContextUsage.maxTokens.toLocaleString()} ({Math.round(claudeContextUsage.percentage)}%)
                </span>
              </div>
              <div className="space-y-1">
                {claudeContextUsage.categories.map((category) => (
                  <div key={category.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{category.name}</span>
                    <span className="font-mono text-foreground">{category.tokens.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Memory files</span>
                <span className="font-mono text-foreground">{claudeContextUsage.memoryFiles.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">MCP tools</span>
                <span className="font-mono text-foreground">{claudeContextUsage.mcpTools.length}</span>
              </div>
            </div>
          ) : null}
          {claudeContextUsageDetail ? (
            <p className="rounded-md border border-border/80 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
              {claudeContextUsageDetail}
            </p>
          ) : null}

          {claudePluginReload ? (
            <div className="space-y-2 rounded-md border border-border/80 bg-background px-3 py-2">
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm">
                  <p className="text-muted-foreground">Commands</p>
                  <p className="font-mono text-foreground">{claudePluginReload.commandCount}</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm">
                  <p className="text-muted-foreground">Agents</p>
                  <p className="font-mono text-foreground">{claudePluginReload.agentCount}</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm">
                  <p className="text-muted-foreground">Plugins</p>
                  <p className="font-mono text-foreground">{claudePluginReload.plugins.length}</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm">
                  <p className="text-muted-foreground">Errors</p>
                  <p className="font-mono text-foreground">{claudePluginReload.errorCount}</p>
                </div>
              </div>
              {claudePluginReload.plugins.length > 0 ? (
                <div className="space-y-1">
                  {claudePluginReload.plugins.map((plugin) => (
                    <div key={`${plugin.name}:${plugin.path}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">{plugin.name}</span>
                      <span className="font-mono text-foreground">{plugin.path}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {claudePluginReload.mcpServers.length > 0 ? (
                <div className="space-y-1">
                  {claudePluginReload.mcpServers.map((server) => (
                    <div key={server.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">{server.name}</span>
                      <span className="font-mono text-foreground">{server.status}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {claudePluginReloadDetail ? (
            <p className="rounded-md border border-border/80 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
              {claudePluginReloadDetail}
            </p>
          ) : null}
        </SettingsCard>

        <SettingsCard
          title="Provider Debug Logging"
          description="Enables verbose stream event logging for all providers in the Electron main-process console."
        >
          <ChoiceButtons
            value={settings.providerDebugStream ? "on" : "off"}
            onChange={(value) => updateSettings({ patch: { providerDebugStream: value === "on" } })}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
        </SettingsCard>

        <SettingsCard
          title="GPU Acceleration"
          description="Electron-reported compositor status for diagnosing WSL2 and filtered transparency performance."
        >
          {gpuStatus ? (
            <div className="space-y-2 rounded-md border border-border/80 bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">Hardware acceleration</span>
                <span className="font-mono text-muted-foreground">
                  {gpuStatus.hardwareAccelerationEnabled ? "enabled" : "disabled"}
                </span>
              </div>
              <div className="space-y-1">
                {gpuStatusRows.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-mono text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : gpuStatusError ? null : (
            <p className="text-sm text-muted-foreground">Loading GPU status…</p>
          )}
          {gpuStatusError ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground">
              {gpuStatusError}
            </p>
          ) : null}
        </SettingsCard>

        <SettingsCard
          title="Session Replay UI"
          description="Shows the Session Replay entry point for the active chat session."
        >
          <ChoiceButtons
            value={settings.turnDiagnosticsVisible ? "on" : "off"}
            onChange={(value) => updateSettings({ patch: { turnDiagnosticsVisible: value === "on" } })}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}
