import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/store/app.store";
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
  const [codexPathOverride, providerDebugStream, turnDiagnosticsVisible] = useAppStore(
    useShallow((state) => [state.settings.codexPathOverride, state.settings.providerDebugStream, state.settings.turnDiagnosticsVisible] as const),
  );
  const [gpuStatus, setGpuStatus] = useState<GpuStatusSnapshot | null>(null);
  const [gpuStatusError, setGpuStatusError] = useState("");
  const updateSettings = useAppStore((state) => state.updateSettings);
  const gpuStatusRows = gpuStatus ? Object.entries(gpuStatus.featureStatus).sort(([left], [right]) => left.localeCompare(right)) : [];

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

  return (
    <>
      <SectionHeading title="Developer" description="Advanced diagnostics and local provider tooling overrides." />
      <SectionStack>
        <SettingsCard title="Codex Binary Path" description="Override the path to the local `codex` binary. Leave empty to use the system install discovered from your PATH/home bin locations.">
          <DraftInput
            className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
            placeholder="/usr/local/bin/codex"
            value={codexPathOverride}
            onCommit={(nextValue) => updateSettings({ patch: { codexPathOverride: nextValue } })}
          />
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <TriangleAlert className="size-4 text-warning" />
              Supported Codex baseline
            </p>
            <p className="mt-1">
              Stave targets Codex SDK `0.115.0` and expects a local `codex` CLI around `0.115.0`.
              If your installed CLI is older, update it or point this field at the version you want Stave to use.
            </p>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Provider Debug Logging"
          description="Enables verbose stream event logging for all providers in the Electron main-process console."
        >
          <ChoiceButtons
            value={providerDebugStream ? "on" : "off"}
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
            value={turnDiagnosticsVisible ? "on" : "off"}
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
