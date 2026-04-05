import {
  buildModelSelectorOptions,
  buildRecommendedModelSelectorOptions,
  buildModelSelectorValue,
  ModelSelector,
} from "@/components/ai-elements/model-selector";
import { Badge, Button } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  formatProviderTimeoutLabel,
  PROVIDER_TIMEOUT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import type { ClaudeSettingSource, ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import {
  buildStaveAutoModelSettingsPatch,
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
  SettingsFieldGuide,
  SettingsCard,
} from "./settings-dialog.shared";

const STAVE_AUTO_MODEL_PROVIDER_IDS = ["claude-code", "codex"] as const;
const STAVE_AUTO_ROLE_MODEL_OPTIONS = buildModelSelectorOptions({
  providerIds: STAVE_AUTO_MODEL_PROVIDER_IDS,
});
const STAVE_AUTO_RECOMMENDED_MODEL_OPTIONS = buildRecommendedModelSelectorOptions({
  options: STAVE_AUTO_ROLE_MODEL_OPTIONS,
});

type ExplainedSelectOption<T extends string> = {
  value: T;
  label: string;
  description: string;
  example?: string;
};

const PROVIDER_TIMEOUT_HELP: ReadonlyArray<ExplainedSelectOption<string>> = PROVIDER_TIMEOUT_OPTIONS.map((value) => ({
  value: String(value),
  label: formatProviderTimeoutLabel(value),
  description:
    value <= 1_800_000
      ? "Fail faster when you mostly use short chats, quick edits, or lightweight reviews."
      : value <= 3_600_000
        ? "Balanced default for normal coding, debugging, and medium-length tool runs."
        : value <= 7_200_000
          ? "Leave room for long refactors, large test suites, or slow external tools."
          : "Best for very long research or automation turns that may stay active for hours.",
  example:
    value <= 1_800_000
      ? "Use this if a turn hanging for half an hour is already a signal that something went wrong."
      : value <= 3_600_000
        ? "Good default when you switch between quick questions and real implementation work."
        : value <= 7_200_000
          ? "Useful when you often run builds, migrations, or repo-wide edits in a single turn."
          : "Choose this only if you intentionally want Codex or Claude to stay attached for very long-running work.",
}));

const CLAUDE_PERMISSION_MODE_HELP = [
  {
    value: "default",
    label: "default",
    description: "Use Claude's standard permission behavior without asking Stave to bias the mode.",
    example: "Pick this when you want the least opinionated baseline and do not need a special workflow.",
  },
  {
    value: "acceptEdits",
    label: "acceptEdits",
    description: "Good default for normal coding sessions where edits are expected but you still want guardrails.",
    example: "Use this for day-to-day feature work, bug fixes, and iterative patching.",
  },
  {
    value: "bypassPermissions",
    label: "bypassPermissions",
    description: "Most autonomous Claude path. Pair it carefully with permission-skipping controls.",
    example: "Use this only when you trust the task scope and want Claude to move with minimal interruption.",
  },
  {
    value: "plan",
    label: "plan",
    description: "Planning-only mode. Stave keeps plan turns separate so you can review strategy before implementation.",
    example: "Use this for architecture, investigation, or task breakdowns before writing code.",
  },
  {
    value: "dontAsk",
    label: "dontAsk",
    description: "Tell Claude not to stop for interactive permission questions during the turn.",
    example: "Useful for fast local workflows when you want fewer pauses but do not want plan mode.",
  },
  {
    value: "auto",
    label: "auto",
    description: "Let Claude choose the most appropriate permission behavior for the turn.",
    example: "Good when your workload shifts between analysis, coding, and light automation throughout the day.",
  },
] as const satisfies readonly ExplainedSelectOption<NonNullable<ProviderRuntimeOptions["claudePermissionMode"]>>[];

const CLAUDE_THINKING_MODE_HELP = [
  {
    value: "adaptive",
    label: "Adaptive",
    description: "Claude decides when deeper thinking is worth the extra latency.",
    example: "Best default when some turns are simple and others need real analysis.",
  },
  {
    value: "enabled",
    label: "Enabled",
    description: "Always ask for explicit thinking, even on simpler prompts.",
    example: "Use this when you prioritize careful reasoning over response speed.",
  },
  {
    value: "disabled",
    label: "Disabled",
    description: "Prefer direct answers without extra thinking overhead.",
    example: "Useful for tiny edits, routing, or repetitive low-risk tasks.",
  },
] as const satisfies readonly ExplainedSelectOption<NonNullable<ProviderRuntimeOptions["claudeThinkingMode"]>>[];

const CLAUDE_EFFORT_HELP = [
  {
    value: "low",
    label: "Low",
    description: "Fastest and lightest reasoning budget.",
    example: "Good for short questions, quick rewrites, and simple code edits.",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced reasoning depth for most day-to-day tasks.",
    example: "Use this as the default if you frequently switch between analysis and implementation.",
  },
  {
    value: "high",
    label: "High",
    description: "Spend more effort on difficult debugging, design, or review work.",
    example: "Useful for tricky bugs, architecture questions, or larger refactors.",
  },
  {
    value: "max",
    label: "Max",
    description: "Highest deliberation and the most latency.",
    example: "Reserve this for genuinely hard tasks where accuracy matters more than speed.",
  },
] as const satisfies readonly ExplainedSelectOption<NonNullable<ProviderRuntimeOptions["claudeEffort"]>>[];

const CLAUDE_SETTING_SOURCE_HELP = [
  {
    value: "project",
    label: "Project",
    description: "Load repo-level Claude settings such as `CLAUDE.md` and project-native slash commands.",
  },
  {
    value: "local",
    label: "Local",
    description: "Load machine-local or workspace-local Claude settings from the runtime environment.",
  },
  {
    value: "user",
    label: "User",
    description: "Load your user-wide Claude settings and personal defaults.",
  },
] as const satisfies ReadonlyArray<{ value: ClaudeSettingSource; label: string; description: string }>;

const CODEX_SANDBOX_MODE_HELP = [
  {
    value: "read-only",
    label: "read-only",
    description: "Read and inspect only. Codex should not mutate files.",
    example: "Use this for reviews, audits, repo exploration, or planning.",
  },
  {
    value: "workspace-write",
    label: "workspace-write",
    description: "Allow edits inside the current workspace and writable roots.",
    example: "Best default for normal implementation work where edits should stay scoped to the repo.",
  },
  {
    value: "danger-full-access",
    label: "danger-full-access",
    description: "Remove most filesystem restrictions and allow broad mutation.",
    example: "Use this only for trusted automation that truly needs unrestricted file access.",
  },
] as const satisfies readonly ExplainedSelectOption<NonNullable<ProviderRuntimeOptions["codexSandboxMode"]>>[];

const CODEX_APPROVAL_POLICY_HELP = [
  {
    value: "never",
    label: "never",
    description: "Do not stop for approval prompts. Codex proceeds directly.",
    example: "Good for trusted local workflows when you want continuous execution.",
  },
  {
    value: "on-request",
    label: "on-request",
    description: "Pause when approval is needed and ask you to confirm.",
    example: "Use this when you want Codex to work normally but still checkpoint risky actions.",
  },
  {
    value: "untrusted",
    label: "untrusted",
    description: "Only pause for actions the runtime treats as untrusted or higher risk.",
    example: "Useful when you want fewer prompts than `on-request` without going fully hands-off.",
  },
] as const satisfies readonly ExplainedSelectOption<NonNullable<ProviderRuntimeOptions["codexApprovalPolicy"]>>[];

const CODEX_REASONING_EFFORT_HELP = [
  {
    value: "minimal",
    label: "Minimal",
    description: "Shortest reasoning path and the least latency.",
    example: "Use this for rote edits, quick file lookups, or tiny transformations.",
  },
  {
    value: "low",
    label: "Low",
    description: "Light reasoning for straightforward work.",
    example: "Good for small implementation tasks and direct answers.",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced depth for everyday coding and debugging.",
    example: "Recommended default when task difficulty varies.",
  },
  {
    value: "high",
    label: "High",
    description: "More deliberate reasoning for harder or more ambiguous tasks.",
    example: "Use this for larger bug hunts, refactors, or multi-step design questions.",
  },
  {
    value: "xhigh",
    label: "X-High",
    description: "Deepest reasoning budget and the highest latency cost.",
    example: "Reserve this for genuinely complex work where you want Codex to think much longer.",
  },
] as const satisfies readonly ExplainedSelectOption<NonNullable<ProviderRuntimeOptions["codexModelReasoningEffort"]>>[];

const CODEX_REASONING_SUMMARY_HELP = [
  {
    value: "auto",
    label: "Auto",
    description: "Let Codex decide whether and how much reasoning summary to return.",
    example: "Good default when you want Stave to adapt across different models.",
  },
  {
    value: "concise",
    label: "Concise",
    description: "Request a short summary of model-side reasoning.",
    example: "Useful when you want quick visibility without a lot of extra text.",
  },
  {
    value: "detailed",
    label: "Detailed",
    description: "Request a fuller reasoning summary when the model supports it.",
    example: "Use this when you care about understanding why Codex chose a path.",
  },
  {
    value: "none",
    label: "None",
    description: "Do not request a reasoning summary.",
    example: "Useful when you want the leanest possible UI output.",
  },
] as const satisfies readonly ExplainedSelectOption<NonNullable<ProviderRuntimeOptions["codexReasoningSummary"]>>[];

const CODEX_REASONING_SUPPORT_HELP = [
  {
    value: "auto",
    label: "Auto",
    description: "Let Stave and the Codex runtime infer whether reasoning summaries are supported.",
    example: "Start here unless you know a model is being detected incorrectly.",
  },
  {
    value: "enabled",
    label: "Enabled",
    description: "Force-enable reasoning summary support even if automatic detection misses it.",
    example: "Use this when a model supports summaries but the CLI does not infer it correctly.",
  },
  {
    value: "disabled",
    label: "Disabled",
    description: "Force-disable reasoning summary support.",
    example: "Use this if a model claims support but returns noisy or broken summary behavior.",
  },
] as const satisfies readonly ExplainedSelectOption<NonNullable<ProviderRuntimeOptions["codexSupportsReasoningSummaries"]>>[];

const CODEX_WEB_SEARCH_HELP = [
  {
    value: "disabled",
    label: "Disabled",
    description: "Do not let Codex use web search.",
    example: "Best when you want fully local reasoning or reproducible offline behavior.",
  },
  {
    value: "cached",
    label: "Cached",
    description: "Allow search in a lower-volatility mode when cached results are available.",
    example: "Useful when you want some search help without always relying on live web access.",
  },
  {
    value: "live",
    label: "Live",
    description: "Allow live web search when the task needs current external information.",
    example: "Use this for latest docs, breaking API changes, or recent news-style facts.",
  },
] as const satisfies readonly ExplainedSelectOption<NonNullable<ProviderRuntimeOptions["codexWebSearchMode"]>>[];

function buildGuideItems<T extends string>(options: readonly ExplainedSelectOption<T>[]) {
  return options.map((option) => ({
    label: option.label,
    description: option.description,
  }));
}

function buildGuideExamples<T extends string>(options: readonly ExplainedSelectOption<T>[]) {
  return options
    .filter((option) => option.example)
    .map((option) => ({
      label: option.label,
      description: option.example ?? "",
    }));
}

function findExplainedOption<T extends string>(
  options: readonly ExplainedSelectOption<T>[],
  value: T,
) {
  return options.find((option) => option.value === value) ?? null;
}

function DescribedSelect<T extends string>(args: {
  value: T;
  options: readonly ExplainedSelectOption<T>[];
  onValueChange: (value: T) => void;
  triggerClassName?: string;
}) {
  const selected = findExplainedOption(args.options, args.value);

  return (
    <div className="space-y-2">
      <Select value={args.value} onValueChange={(value) => args.onValueChange(value as T)}>
        <SelectTrigger className={args.triggerClassName ?? "w-64"}>
          <span className="line-clamp-1">{selected?.label ?? args.value}</span>
        </SelectTrigger>
        <SelectContent className="max-w-sm">
          {args.options.map((option) => (
            <SelectItem key={option.value} value={option.value} textValue={option.label}>
              <div className="flex max-w-[20rem] flex-col items-start gap-0.5 py-0.5">
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs leading-5 text-muted-foreground">{option.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected ? (
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">{selected.label}:</span>{" "}
          {selected.description}
          {selected.example ? ` Example: ${selected.example}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function StaveAutoModelField(args: {
  title: string;
  description: string;
  value: string;
  onSelect: (model: string) => void;
}) {
  return (
    <LabeledField title={args.title} description={args.description}>
      <ModelSelector
        value={buildModelSelectorValue({ model: args.value })}
        options={STAVE_AUTO_ROLE_MODEL_OPTIONS}
        recommendedOptions={STAVE_AUTO_RECOMMENDED_MODEL_OPTIONS}
        className="w-full"
        triggerClassName="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40"
        menuClassName="sm:max-w-lg"
        onSelect={({ selection }) => args.onSelect(selection.model)}
      />
    </LabeledField>
  );
}

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
      <StaveAutoModelField
        title="Supervisor Model"
        description="Used for orchestration planning and synthesis. Default: claude-sonnet-4-6."
        value={staveAutoSupervisorModel}
        onSelect={(model) => updateSettings({ patch: { staveAutoSupervisorModel: model } })}
      />
      <StaveAutoModelField
        title="Plan Model"
        description="Used for strategy, design, and plan-only requests."
        value={staveAutoPlanModel}
        onSelect={(model) => updateSettings({ patch: { staveAutoPlanModel: model } })}
      />
      <StaveAutoModelField
        title="Analyze Model"
        description="Used for debugging, review, explanation, architecture, and root-cause analysis."
        value={staveAutoAnalyzeModel}
        onSelect={(model) => updateSettings({ patch: { staveAutoAnalyzeModel: model } })}
      />
      <StaveAutoModelField
        title="Implement Model"
        description="Used for feature work, code generation, patching, refactors, and test writing."
        value={staveAutoImplementModel}
        onSelect={(model) => updateSettings({ patch: { staveAutoImplementModel: model } })}
      />
      <StaveAutoModelField
        title="Quick Edit Model"
        description="Used for rename, typo, and tiny targeted edits."
        value={staveAutoQuickEditModel}
        onSelect={(model) => updateSettings({ patch: { staveAutoQuickEditModel: model } })}
      />
      <StaveAutoModelField
        title="General Model"
        description="Used when the request does not strongly match another role."
        value={staveAutoGeneralModel}
        onSelect={(model) => updateSettings({ patch: { staveAutoGeneralModel: model } })}
      />
      <StaveAutoModelField
        title="Verify Model"
        description="Used for validation, sanity checks, and review after implementation."
        value={staveAutoVerifyModel}
        onSelect={(model) => updateSettings({ patch: { staveAutoVerifyModel: model } })}
      />
      <StaveAutoModelField
        title="Classifier Model"
        description="Lightweight model that decides whether to route directly or orchestrate."
        value={staveAutoClassifierModel}
        onSelect={(model) => updateSettings({ patch: { staveAutoClassifierModel: model } })}
      />
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
          <LabeledField
            title="Timeout Window"
            guide={(
              <SettingsFieldGuide
                title="Provider Timeout"
                summary="Longer timeouts are safer for big turns, but shorter timeouts surface stuck sessions faster."
                items={buildGuideItems(PROVIDER_TIMEOUT_HELP)}
                examples={buildGuideExamples(PROVIDER_TIMEOUT_HELP)}
                tooltip="Compare timeout values"
              />
            )}
          >
            <div className="flex flex-wrap items-start gap-3">
              <DescribedSelect
                value={String(providerTimeoutMs || DEFAULT_PROVIDER_TIMEOUT_MS)}
                options={PROVIDER_TIMEOUT_HELP}
                onValueChange={(value) => updateSettings({ patch: { providerTimeoutMs: readInt(value, providerTimeoutMs) } })}
                triggerClassName="w-40"
              />
              <span className="pt-2 text-sm text-muted-foreground">{formatProviderTimeoutLabel(providerTimeoutMs || DEFAULT_PROVIDER_TIMEOUT_MS)}</span>
            </div>
          </LabeledField>
        </SettingsCard>

        <SettingsCard title="Claude Runtime Controls" description="Permission, sandbox, thinking, and subagent progress behavior passed into each Claude turn.">
          <LabeledField
            title="Permission Mode"
            description="Controls how aggressively Claude asks for permission during a turn."
            guide={(
              <SettingsFieldGuide
                title="Claude Permission Mode"
                summary="This is the main autonomy dial for Claude turns."
                items={buildGuideItems(CLAUDE_PERMISSION_MODE_HELP)}
                examples={buildGuideExamples(CLAUDE_PERMISSION_MODE_HELP)}
                note="`plan` is special in Stave: it becomes a planning workflow rather than a normal implementation turn."
                tooltip="Compare Claude permission modes"
              />
            )}
          >
            <DescribedSelect
              value={claudePermissionMode}
              options={CLAUDE_PERMISSION_MODE_HELP}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    claudePermissionMode: value,
                  },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Dangerous Skip Permissions"
            description="Only applies when `bypassPermissions` is active."
          >
            <ChoiceButtons
              value={claudeAllowDangerouslySkipPermissions ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeAllowDangerouslySkipPermissions: value === "on" } })}
              options={[
                { value: "on", label: "On", description: "Let Claude skip permission prompts more aggressively." },
                { value: "off", label: "Off", description: "Keep dangerous skip behavior disabled." },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Sandbox Enabled"
            description="Wrap Claude tool execution in its sandbox configuration."
          >
            <ChoiceButtons
              value={claudeSandboxEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeSandboxEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On", description: "Request sandboxed Claude tool execution." },
                { value: "off", label: "Off", description: "Do not ask Claude to use its sandbox." },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Allow Unsandboxed Commands"
            description="Controls whether Claude may fall back to commands outside the sandbox."
          >
            <ChoiceButtons
              value={claudeAllowUnsandboxedCommands ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeAllowUnsandboxedCommands: value === "on" } })}
              options={[
                { value: "on", label: "On", description: "Permit fallbacks that cannot stay sandboxed." },
                { value: "off", label: "Off", description: "Reject commands that would escape the sandbox." },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Setting Sources"
            description="Controls which Claude filesystem setting layers are loaded. `project` is required for CLAUDE.md and project slash commands."
            guide={(
              <SettingsFieldGuide
                title="Claude Setting Sources"
                summary="These layers decide which Claude configuration files and commands participate in each turn."
                items={CLAUDE_SETTING_SOURCE_HELP.map((option) => ({
                  label: option.label,
                  description: option.description,
                }))}
                tooltip="What each Claude setting source does"
              />
            )}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {CLAUDE_SETTING_SOURCE_HELP.map((option) => (
                <Button
                  key={option.value}
                  className="h-auto min-h-16 items-start justify-start whitespace-normal rounded-md px-3 py-2.5 text-left"
                  variant={claudeSettingSources.includes(option.value) ? "default" : "outline"}
                  onClick={() => toggleClaudeSettingSource(option.value)}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="text-xs opacity-80">{option.description}</p>
                  </div>
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Active: {claudeSettingSources.length > 0 ? claudeSettingSources.join(" + ") : "none"}
            </p>
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
          <LabeledField
            title="Thinking Mode"
            guide={(
              <SettingsFieldGuide
                title="Claude Thinking Mode"
                summary="Thinking controls whether Claude spends extra effort on explicit reasoning before answering."
                items={buildGuideItems(CLAUDE_THINKING_MODE_HELP)}
                examples={buildGuideExamples(CLAUDE_THINKING_MODE_HELP)}
                tooltip="Compare Claude thinking modes"
              />
            )}
          >
            <DescribedSelect
              value={claudeThinkingMode}
              options={CLAUDE_THINKING_MODE_HELP}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    claudeThinkingMode: value,
                  },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Effort"
            guide={(
              <SettingsFieldGuide
                title="Claude Effort"
                summary="Higher effort spends more model budget on reasoning and usually increases latency."
                items={buildGuideItems(CLAUDE_EFFORT_HELP)}
                examples={buildGuideExamples(CLAUDE_EFFORT_HELP)}
                tooltip="Compare Claude effort levels"
              />
            )}
          >
            <DescribedSelect
              value={claudeEffort}
              options={CLAUDE_EFFORT_HELP}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    claudeEffort: value,
                  },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Agent Progress Summaries"
            description="Enables Claude SDK `task_progress.summary` updates for running subagents."
          >
            <ChoiceButtons
              value={claudeAgentProgressSummaries ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeAgentProgressSummaries: value === "on" } })}
              options={[
                { value: "on", label: "On", description: "Show running subagent progress summaries in chat." },
                { value: "off", label: "Off", description: "Keep subagent progress quieter and show only final output." },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Fast Mode"
            description="Enables Claude's /fast mode, which uses Haiku for faster responses on simpler tasks."
          >
            <ChoiceButtons
              value={claudeFastMode ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeFastMode: value === "on" } })}
              options={[
                { value: "on", label: "On", description: "Bias toward faster responses on simpler tasks." },
                { value: "off", label: "Off", description: "Use the normal Claude runtime path." },
              ]}
            />
          </LabeledField>
        </SettingsCard>

        <SettingsCard title="Codex Runtime Controls" description="Per-turn Codex sandbox, approval, reasoning, and web-search settings.">
          <LabeledField
            title="Network Access"
            description="Controls whether Codex may use networked capabilities during a turn."
          >
            <ChoiceButtons
              value={codexNetworkAccessEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexNetworkAccessEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On", description: "Allow browsing, web search, and other networked Codex features." },
                { value: "off", label: "Off", description: "Keep Codex local to the workspace and configured tools." },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Skip Git Repo Check"
            description="Allows Codex turns to run in folders that are not Git repositories."
          >
            <ChoiceButtons
              value={codexSkipGitRepoCheck ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexSkipGitRepoCheck: value === "on" } })}
              options={[
                { value: "on", label: "On", description: "Run Codex even when the current folder is not a Git repo." },
                { value: "off", label: "Off", description: "Require a Git repository before starting Codex turns." },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Sandbox Mode"
            guide={(
              <SettingsFieldGuide
                title="Codex Sandbox Mode"
                summary="This setting controls where Codex can read and write on disk."
                items={buildGuideItems(CODEX_SANDBOX_MODE_HELP)}
                examples={buildGuideExamples(CODEX_SANDBOX_MODE_HELP)}
                note="When Stave runs Codex in plan mode, it forces `read-only` regardless of the normal setting."
                tooltip="Compare Codex sandbox modes"
              />
            )}
          >
            <DescribedSelect
              value={codexSandboxMode}
              options={CODEX_SANDBOX_MODE_HELP}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexSandboxMode: value,
                  },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Approval Policy"
            guide={(
              <SettingsFieldGuide
                title="Codex Approval Policy"
                summary="Approval policy controls when Codex pauses to ask before acting."
                items={buildGuideItems(CODEX_APPROVAL_POLICY_HELP)}
                examples={buildGuideExamples(CODEX_APPROVAL_POLICY_HELP)}
                note="Stave forces `never` during Codex plan mode so planning turns do not stop on approval prompts."
                tooltip="Compare Codex approval policies"
              />
            )}
          >
            <DescribedSelect
              value={codexApprovalPolicy}
              options={CODEX_APPROVAL_POLICY_HELP}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexApprovalPolicy: value,
                  },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Reasoning Effort"
            guide={(
              <SettingsFieldGuide
                title="Codex Reasoning Effort"
                summary="Higher effort gives Codex more room to reason, but it also tends to slow the turn down."
                items={buildGuideItems(CODEX_REASONING_EFFORT_HELP)}
                examples={buildGuideExamples(CODEX_REASONING_EFFORT_HELP)}
                tooltip="Compare Codex reasoning effort levels"
              />
            )}
          >
            <DescribedSelect
              value={codexModelReasoningEffort}
              options={CODEX_REASONING_EFFORT_HELP}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexModelReasoningEffort: value,
                  },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Reasoning Summary"
            description="Codex config for model-side reasoning summaries when supported."
            guide={(
              <SettingsFieldGuide
                title="Codex Reasoning Summary"
                summary="This controls how much reasoning summary Codex should try to return when the model supports it."
                items={buildGuideItems(CODEX_REASONING_SUMMARY_HELP)}
                examples={buildGuideExamples(CODEX_REASONING_SUMMARY_HELP)}
                tooltip="Compare Codex reasoning summary modes"
              />
            )}
          >
            <DescribedSelect
              value={codexReasoningSummary}
              options={CODEX_REASONING_SUMMARY_HELP}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexReasoningSummary: value,
                  },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Supports Reasoning Summaries"
            description="Override Codex capability detection when a model supports reasoning summaries but the CLI cannot infer it."
            guide={(
              <SettingsFieldGuide
                title="Reasoning Summary Capability Override"
                summary="Only touch this when automatic capability detection is wrong."
                items={buildGuideItems(CODEX_REASONING_SUPPORT_HELP)}
                examples={buildGuideExamples(CODEX_REASONING_SUPPORT_HELP)}
                tooltip="How reasoning summary support override works"
              />
            )}
          >
            <DescribedSelect
              value={codexSupportsReasoningSummaries}
              options={CODEX_REASONING_SUPPORT_HELP}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexSupportsReasoningSummaries: value,
                  },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Raw Agent Reasoning"
            description="Shows low-level reasoning traces when Codex emits them."
          >
            <ChoiceButtons
              value={codexShowRawAgentReasoning ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexShowRawAgentReasoning: value === "on" } })}
              options={[
                { value: "on", label: "On", description: "Surface raw reasoning events in the Stave UI." },
                { value: "off", label: "Off", description: "Hide raw reasoning traces and keep the UI quieter." },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Web Search Mode"
            description="Default is `disabled` to match the current Codex CLI opt-in `--search` behavior."
            guide={(
              <SettingsFieldGuide
                title="Codex Web Search Mode"
                summary="Use this when Codex needs outside knowledge rather than only repo-local context."
                items={buildGuideItems(CODEX_WEB_SEARCH_HELP)}
                examples={buildGuideExamples(CODEX_WEB_SEARCH_HELP)}
                tooltip="Compare Codex web search modes"
              />
            )}
          >
            <DescribedSelect
              value={codexWebSearchMode}
              options={CODEX_WEB_SEARCH_HELP}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexWebSearchMode: value,
                  },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Fast Mode"
            description="Enables Codex fast_mode feature flag for faster responses on simpler tasks."
          >
            <ChoiceButtons
              value={codexFastMode ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexFastMode: value === "on" } })}
              options={[
                { value: "on", label: "On", description: "Bias toward faster Codex turns on simpler work." },
                { value: "off", label: "Off", description: "Use the normal Codex runtime path." },
              ]}
            />
          </LabeledField>
        </SettingsCard>

        <StaveAutoCard />
      </SectionStack>
    </>
  );
}
