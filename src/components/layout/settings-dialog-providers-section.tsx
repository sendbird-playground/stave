import { Badge, Button } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CLAUDE_SDK_MODEL_OPTIONS,
  CODEX_SDK_MODEL_OPTIONS,
  normalizeModelSelection,
} from "@/lib/providers/model-catalog";
import {
  BOOLEAN_TOGGLE_OPTIONS,
  CLAUDE_EFFORT_OPTIONS,
  CLAUDE_PERMISSION_MODE_OPTIONS,
  CLAUDE_SETTING_SOURCE_OPTIONS,
  CLAUDE_THINKING_OPTIONS,
  CODEX_APPROVAL_POLICY_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  CODEX_REASONING_SUMMARY_OPTIONS,
  CODEX_REASONING_SUPPORT_OPTIONS,
  CODEX_SANDBOX_MODE_OPTIONS,
  CODEX_WEB_SEARCH_OPTIONS,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  formatProviderTimeoutLabel,
  PROVIDER_TIMEOUT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import {
  buildStaveAutoModelSettingsPatch,
  DEFAULT_STAVE_AUTO_MODEL_PRESET_ID,
  detectStaveAutoModelPreset,
  STAVE_AUTO_MODEL_PRESETS,
} from "@/lib/providers/stave-auto-profile";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  readInt,
  SectionHeading,
  SectionStack,
  SettingsCard,
} from "./settings-dialog.shared";

const STAVE_ROUTING_MODEL_OPTIONS = [...CLAUDE_SDK_MODEL_OPTIONS, ...CODEX_SDK_MODEL_OPTIONS] as const;

function StaveAutoCard() {
  const [
    staveAutoClassifierModel,
    staveAutoSupervisorModel,
    staveAutoPlanModel,
    staveAutoAnalyzeModel,
    staveAutoImplementModel,
    staveAutoQuickEditModel,
    staveAutoGeneralModel,
    staveAutoVerifyModel,
    staveAutoOrchestrationMode,
    staveAutoMaxSubtasks,
    staveAutoMaxParallelSubtasks,
    staveAutoAllowCrossProviderWorkers,
    staveAutoFastMode,
  ] = useAppStore(
    useShallow((state) => [
      state.settings.staveAutoClassifierModel,
      state.settings.staveAutoSupervisorModel,
      state.settings.staveAutoPlanModel,
      state.settings.staveAutoAnalyzeModel,
      state.settings.staveAutoImplementModel,
      state.settings.staveAutoQuickEditModel,
      state.settings.staveAutoGeneralModel,
      state.settings.staveAutoVerifyModel,
      state.settings.staveAutoOrchestrationMode,
      state.settings.staveAutoMaxSubtasks,
      state.settings.staveAutoMaxParallelSubtasks,
      state.settings.staveAutoAllowCrossProviderWorkers,
      state.settings.staveAutoFastMode,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const currentPresetId = detectStaveAutoModelPreset({
    settings: {
      staveAutoClassifierModel,
      staveAutoSupervisorModel,
      staveAutoPlanModel,
      staveAutoAnalyzeModel,
      staveAutoImplementModel,
      staveAutoQuickEditModel,
      staveAutoGeneralModel,
      staveAutoVerifyModel,
    },
  });
  const currentPreset = STAVE_AUTO_MODEL_PRESETS.find((preset) => preset.id === currentPresetId) ?? null;
  const fallbackPreset = buildStaveAutoModelSettingsPatch({
    presetId: currentPresetId ?? DEFAULT_STAVE_AUTO_MODEL_PRESET_ID,
  });

  return (
    <SettingsCard
      title="Stave Auto"
      description="Role-based defaults for Stave Auto. Apply a preset for a full role map, then fine-tune any individual model below."
    >
      <LabeledField
        title="Model Preset"
        description="Applying a preset rewrites every Stave Auto role model at once."
      >
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {STAVE_AUTO_MODEL_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                className="h-auto min-h-20 items-start justify-start whitespace-normal px-4 py-3 text-left"
                variant={currentPresetId === preset.id ? "default" : "outline"}
                onClick={() => updateSettings({ patch: buildStaveAutoModelSettingsPatch({ presetId: preset.id }) })}
              >
                <div className="w-full space-y-1">
                  <p className="text-sm font-medium">{preset.label}</p>
                  <p className="text-xs opacity-80">{preset.description}</p>
                </div>
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5">
            <Badge variant={currentPreset ? "default" : "secondary"}>
              {currentPreset ? `Current: ${currentPreset.label}` : "Current: Custom"}
            </Badge>
            <p className="text-xs text-muted-foreground">
              {currentPreset
                ? currentPreset.description
                : "Manual overrides are active. Pick a preset again to reapply a full Stave Auto model map."}
            </p>
          </div>
        </div>
      </LabeledField>
      <LabeledField
        title="Orchestration Mode"
        description="Off = direct routing only. Auto = orchestrate only when needed. Aggressive = bias toward multi-step workflows."
      >
        <Select
          value={staveAutoOrchestrationMode}
          onValueChange={(value) =>
            updateSettings({
              patch: { staveAutoOrchestrationMode: value as "off" | "auto" | "aggressive" },
            })}
        >
          <SelectTrigger className="h-10 rounded-md border-border/80 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">off</SelectItem>
            <SelectItem value="auto">auto</SelectItem>
            <SelectItem value="aggressive">aggressive</SelectItem>
          </SelectContent>
        </Select>
      </LabeledField>
      <LabeledField
        title="Fast Mode"
        description="Requests fast execution for Stave Auto turns. It is only applied to providers whose fast mode is available in this workspace."
      >
        <ChoiceButtons
          value={staveAutoFastMode ? "on" : "off"}
          onChange={(value) => updateSettings({ patch: { staveAutoFastMode: value === "on" } })}
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
      </LabeledField>
      <LabeledField title="Supervisor Model" description="Used for orchestration planning and synthesis. Default: claude-sonnet-4-6.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoSupervisorModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoSupervisorModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoSupervisorModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Plan Model" description="Used for strategy, design, and plan-only requests.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoPlanModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoPlanModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoPlanModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Analyze Model" description="Used for debugging, review, explanation, architecture, and root-cause analysis.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoAnalyzeModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoAnalyzeModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoAnalyzeModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Implement Model" description="Used for feature work, code generation, patching, refactors, and test writing.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoImplementModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoImplementModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoImplementModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Quick Edit Model" description="Used for rename, typo, and tiny targeted edits.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoQuickEditModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoQuickEditModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoQuickEditModel }) } })}
        />
      </LabeledField>
      <LabeledField title="General Model" description="Used when the request does not strongly match another role.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoGeneralModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoGeneralModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoGeneralModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Verify Model" description="Used for validation, sanity checks, and review after implementation.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoVerifyModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoVerifyModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoVerifyModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Classifier Model" description="Lightweight model that decides whether to route directly or orchestrate.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoClassifierModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoClassifierModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoClassifierModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Max Subtasks" description="Upper bound for supervisor-generated subtasks per orchestration run.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          value={String(staveAutoMaxSubtasks)}
          onCommit={(value) =>
            updateSettings({ patch: { staveAutoMaxSubtasks: Math.min(8, Math.max(1, readInt(value, 3))) } })}
        />
      </LabeledField>
      <LabeledField title="Max Parallel Subtasks" description="How many independent subtasks Stave may execute at the same time.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          value={String(staveAutoMaxParallelSubtasks)}
          onCommit={(value) =>
            updateSettings({ patch: { staveAutoMaxParallelSubtasks: Math.min(8, Math.max(1, readInt(value, 2))) } })}
        />
      </LabeledField>
      <LabeledField title="Cross-Provider Workers" description="Allow orchestration to mix Claude and Codex workers in the same request.">
        <ChoiceButtons
          value={staveAutoAllowCrossProviderWorkers ? "on" : "off"}
          onChange={(value) => updateSettings({ patch: { staveAutoAllowCrossProviderWorkers: value === "on" } })}
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
      </LabeledField>
      <datalist id="stave-auto-model-options">
        {STAVE_ROUTING_MODEL_OPTIONS.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
    </SettingsCard>
  );
}

export function ProvidersSection() {
  const [
    providerTimeoutMs,
    claudePermissionMode,
    claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands,
    claudeTaskBudgetTokens,
    claudeSettingSources,
    claudeEffort,
    claudeThinkingMode,
    claudeAgentProgressSummaries,
    claudeFastMode,
    codexSandboxMode,
    codexSkipGitRepoCheck,
    codexNetworkAccessEnabled,
    codexApprovalPolicy,
    codexModelReasoningEffort,
    codexWebSearchMode,
    codexShowRawAgentReasoning,
    codexReasoningSummary,
    codexSupportsReasoningSummaries,
    codexFastMode,
  ] = useAppStore(
    useShallow((state) => [
      state.settings.providerTimeoutMs,
      state.settings.claudePermissionMode,
      state.settings.claudeAllowDangerouslySkipPermissions,
      state.settings.claudeSandboxEnabled,
      state.settings.claudeAllowUnsandboxedCommands,
      state.settings.claudeTaskBudgetTokens,
      state.settings.claudeSettingSources,
      state.settings.claudeEffort,
      state.settings.claudeThinkingMode,
      state.settings.claudeAgentProgressSummaries,
      state.settings.claudeFastMode,
      state.settings.codexSandboxMode,
      state.settings.codexSkipGitRepoCheck,
      state.settings.codexNetworkAccessEnabled,
      state.settings.codexApprovalPolicy,
      state.settings.codexModelReasoningEffort,
      state.settings.codexWebSearchMode,
      state.settings.codexShowRawAgentReasoning,
      state.settings.codexReasoningSummary,
      state.settings.codexSupportsReasoningSummaries,
      state.settings.codexFastMode,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const toggleClaudeSettingSource = (source: "user" | "project" | "local") => {
    updateSettings({
      patch: {
        claudeSettingSources: claudeSettingSources.includes(source)
          ? claudeSettingSources.filter((item) => item !== source)
          : [...claudeSettingSources, source],
      },
    });
  };

  return (
    <>
      <SectionHeading title="Providers" description="Runtime controls for Claude and Codex execution behavior." />
      <SectionStack>
        <SettingsCard
          title="Provider Timeout"
          description="Maximum time to wait for a Claude or Codex SDK response before showing a timeout error."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(providerTimeoutMs)}
              onValueChange={(value) => updateSettings({ patch: { providerTimeoutMs: readInt(value, providerTimeoutMs) } })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_TIMEOUT_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {formatProviderTimeoutLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{formatProviderTimeoutLabel(providerTimeoutMs || DEFAULT_PROVIDER_TIMEOUT_MS)}</span>
          </div>
        </SettingsCard>

        <SettingsCard title="Claude Runtime Controls" description="Permission, sandbox, thinking, and subagent progress behavior passed into each Claude turn.">
          <LabeledField title="Permission Mode">
            <Select
              value={claudePermissionMode}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    claudePermissionMode: value as "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLAUDE_PERMISSION_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField title="Dangerous Skip Permissions">
            <ChoiceButtons
              value={claudeAllowDangerouslySkipPermissions ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeAllowDangerouslySkipPermissions: value === "on" } })}
              options={[...BOOLEAN_TOGGLE_OPTIONS]}
            />
          </LabeledField>
          <LabeledField title="Sandbox Enabled">
            <ChoiceButtons
              value={claudeSandboxEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeSandboxEnabled: value === "on" } })}
              options={[...BOOLEAN_TOGGLE_OPTIONS]}
            />
          </LabeledField>
          <LabeledField title="Allow Unsandboxed Commands">
            <ChoiceButtons
              value={claudeAllowUnsandboxedCommands ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeAllowUnsandboxedCommands: value === "on" } })}
              options={[...BOOLEAN_TOGGLE_OPTIONS]}
            />
          </LabeledField>
          <LabeledField
            title="Setting Sources"
            description="Controls which Claude filesystem setting layers are loaded. `project` is required for CLAUDE.md and project slash commands."
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {CLAUDE_SETTING_SOURCE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  className="h-9 rounded-md"
                  variant={claudeSettingSources.includes(option.value) ? "default" : "outline"}
                  onClick={() => toggleClaudeSettingSource(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </LabeledField>
          <LabeledField
            title="Task Budget (Tokens)"
            description="Advisory token budget sent to Claude so it can pace tool use and wrap up earlier. Use `0` to disable."
          >
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              value={String(claudeTaskBudgetTokens)}
              onCommit={(value) => updateSettings({
                patch: {
                  claudeTaskBudgetTokens: Math.min(1_000_000, Math.max(0, readInt(value, claudeTaskBudgetTokens))),
                },
              })}
            />
          </LabeledField>
          <LabeledField title="Thinking Mode">
            <Select
              value={claudeThinkingMode}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    claudeThinkingMode: value as "adaptive" | "enabled" | "disabled",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLAUDE_THINKING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField title="Effort">
            <Select
              value={claudeEffort}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    claudeEffort: value as "low" | "medium" | "high" | "max",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLAUDE_EFFORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField
            title="Agent Progress Summaries"
            description="Enables Claude SDK `task_progress.summary` updates for running subagents."
          >
            <ChoiceButtons
              value={claudeAgentProgressSummaries ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeAgentProgressSummaries: value === "on" } })}
              options={[...BOOLEAN_TOGGLE_OPTIONS]}
            />
          </LabeledField>
          <LabeledField
            title="Fast Mode"
            description="Enables Claude's /fast mode, which uses Haiku for faster responses on simpler tasks."
          >
            <ChoiceButtons
              value={claudeFastMode ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeFastMode: value === "on" } })}
              options={[...BOOLEAN_TOGGLE_OPTIONS]}
            />
          </LabeledField>
        </SettingsCard>

        <SettingsCard title="Codex Runtime Controls" description="Per-turn Codex sandbox, approval, reasoning, and web-search settings.">
          <LabeledField title="Network Access">
            <ChoiceButtons
              value={codexNetworkAccessEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexNetworkAccessEnabled: value === "on" } })}
              options={[...BOOLEAN_TOGGLE_OPTIONS]}
            />
          </LabeledField>
          <LabeledField
            title="Skip Git Repo Check"
            description="Allows Codex turns to run in folders that are not Git repositories."
          >
            <ChoiceButtons
              value={codexSkipGitRepoCheck ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexSkipGitRepoCheck: value === "on" } })}
              options={[...BOOLEAN_TOGGLE_OPTIONS]}
            />
          </LabeledField>
          <LabeledField title="Sandbox Mode">
            <Select
              value={codexSandboxMode}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexSandboxMode: value as "read-only" | "workspace-write" | "danger-full-access",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CODEX_SANDBOX_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField title="Approval Policy">
            <Select
              value={codexApprovalPolicy}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexApprovalPolicy: value as "never" | "on-request" | "untrusted",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CODEX_APPROVAL_POLICY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField title="Reasoning Effort">
            <Select
              value={codexModelReasoningEffort}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexModelReasoningEffort: value as "minimal" | "low" | "medium" | "high" | "xhigh",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CODEX_EFFORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField
            title="Reasoning Summary"
            description="Codex config for model-side reasoning summaries when supported."
          >
            <Select
              value={codexReasoningSummary}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexReasoningSummary: value as "auto" | "concise" | "detailed" | "none",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CODEX_REASONING_SUMMARY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField
            title="Supports Reasoning Summaries"
            description="Override Codex capability detection when a model supports reasoning summaries but the CLI cannot infer it."
          >
            <Select
              value={codexSupportsReasoningSummaries}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexSupportsReasoningSummaries: value as "auto" | "enabled" | "disabled",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CODEX_REASONING_SUPPORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField title="Raw Agent Reasoning">
            <ChoiceButtons
              value={codexShowRawAgentReasoning ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexShowRawAgentReasoning: value === "on" } })}
              options={[...BOOLEAN_TOGGLE_OPTIONS]}
            />
          </LabeledField>
          <LabeledField
            title="Web Search Mode"
            description="Default is `disabled` to match the current Codex CLI opt-in `--search` behavior."
          >
            <Select
              value={codexWebSearchMode}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexWebSearchMode: value as "disabled" | "cached" | "live",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CODEX_WEB_SEARCH_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField
            title="Fast Mode"
            description="Enables Codex fast_mode feature flag for faster responses on simpler tasks."
          >
            <ChoiceButtons
              value={codexFastMode ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexFastMode: value === "on" } })}
              options={[...BOOLEAN_TOGGLE_OPTIONS]}
            />
          </LabeledField>
        </SettingsCard>

        <StaveAutoCard />
      </SectionStack>
    </>
  );
}
