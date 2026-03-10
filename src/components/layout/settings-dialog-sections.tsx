import { memo, useState } from "react";
import { Bot, Code2, Cog, Globe, KeyRound, Monitor, Moon, Palette, ScrollText, SearchCheck, Shield, Sun, TerminalSquare, TriangleAlert, Wrench } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CLAUDE_SDK_MODEL_OPTIONS,
  CODEX_SDK_MODEL_OPTIONS,
  getDefaultModelForProvider,
  normalizeModelSelection,
} from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { PRESET_THEME_TOKENS, THEME_TOKEN_NAMES, type ThemeModeName, type ThemeTokenName, useAppStore } from "@/store/app.store";

export const settingsSections = [
  { id: "general", label: "General", icon: Cog },
  { id: "theme", label: "Design", icon: Palette },
  { id: "chat", label: "Chat", icon: Bot },
  { id: "providers", label: "Providers", icon: Wrench },
  { id: "subagents", label: "Subagent", icon: Wrench },
  { id: "skills", label: "Skills", icon: SearchCheck },
  { id: "commands", label: "Command", icon: KeyRound },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "editor", label: "Editor", icon: Code2 },
  { id: "developer", label: "Developer", icon: Wrench },
] as const;

export type SectionId = (typeof settingsSections)[number]["id"];

export const settingsSectionGroups: Array<{ label: string; ids: SectionId[] }> = [
  { label: "Workspace", ids: ["general", "theme", "editor", "terminal"] },
  { label: "Agents", ids: ["chat", "providers"] },
  { label: "Automation", ids: ["subagents", "skills", "commands", "developer"] },
];

function readInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function readFloat(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function formatChatFontSizeLabel(size: "base" | "lg" | "xl") {
  if (size === "xl") {
    return "Extra Large · 20px";
  }
  if (size === "lg") {
    return "Large · 18px";
  }
  return "Base · 16px";
}

function formatThemeTokenLabel(token: ThemeTokenName) {
  return token
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function SectionHeading(args: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-2xl font-semibold tracking-tight">{args.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{args.description}</p>
    </div>
  );
}

function SectionStack(args: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-4">{args.children}</section>;
}

function SettingsCard(args: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-border/80 bg-card/90 shadow-xs", args.className)}>
      <CardHeader className="pb-2.5">
        <CardTitle className="text-base">{args.title}</CardTitle>
        {args.description ? <CardDescription>{args.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3.5">{args.children}</CardContent>
    </Card>
  );
}

function ChoiceButtons<T extends string>(args: {
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className={cn("grid gap-2", args.columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {args.options.map((option) => (
        <Button
          key={option.value}
          className="h-9 rounded-md"
          variant={args.value === option.value ? "default" : "outline"}
          onClick={() => args.onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function LabeledField(args: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="space-y-1">
        <p className="text-sm font-medium">{args.title}</p>
        {args.description ? <p className="text-sm text-muted-foreground">{args.description}</p> : null}
      </div>
      {args.children}
    </div>
  );
}

function GeneralSection() {
  const language = useAppStore((state) => state.settings.language);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="General" description="Global defaults for language and workspace-wide app behavior." />
      <SectionStack>
        <SettingsCard title="Language" description="Reserved for future localization support.">
          <Input
            className="h-10 rounded-md border-border/80 bg-background"
            value={language}
            onChange={(event) => updateSettings({ patch: { language: event.target.value } })}
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function ThemeSection() {
  const [themeEditorMode, setThemeEditorMode] = useState<ThemeModeName>("light");
  const themeMode = useAppStore((state) => state.settings.themeMode);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Design" description="Control theme mode and the shadcn token values that shape the interface." />
      <SectionStack>
        <SettingsCard title="Appearance" description="Choose how the app resolves light and dark mode.">
          <div className="grid gap-2 sm:grid-cols-3">
            <Button className="h-10 rounded-md" variant={themeMode === "light" ? "default" : "outline"} onClick={() => updateSettings({ patch: { themeMode: "light" } })}>
              <Sun className="size-4" />
              Light
            </Button>
            <Button className="h-10 rounded-md" variant={themeMode === "dark" ? "default" : "outline"} onClick={() => updateSettings({ patch: { themeMode: "dark" } })}>
              <Moon className="size-4" />
              Dark
            </Button>
            <Button className="h-10 rounded-md" variant={themeMode === "system" ? "default" : "outline"} onClick={() => updateSettings({ patch: { themeMode: "system" } })}>
              <Monitor className="size-4" />
              System
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Design Tokens"
          description="Defaults follow `bunx --bun shadcn@latest init --preset aIkf1Td`. Override any token below."
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Button size="sm" variant={themeEditorMode === "light" ? "default" : "outline"} onClick={() => setThemeEditorMode("light")}>
                Light Tokens
              </Button>
              <Button size="sm" variant={themeEditorMode === "dark" ? "default" : "outline"} onClick={() => setThemeEditorMode("dark")}>
                Dark Tokens
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const themeOverrides = useAppStore.getState().settings.themeOverrides;
                updateSettings({
                  patch: {
                    themeOverrides: {
                      ...themeOverrides,
                      [themeEditorMode]: {},
                    },
                  },
                });
              }}
            >
              Reset {themeEditorMode}
            </Button>
          </div>

          <div className="grid gap-3">
            {THEME_TOKEN_NAMES.map((token) => (
              <ThemeTokenRow key={`${themeEditorMode}-${token}`} token={token} themeEditorMode={themeEditorMode} />
            ))}
          </div>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

const ThemeTokenRow = memo(function ThemeTokenRow(args: { token: ThemeTokenName; themeEditorMode: ThemeModeName }) {
  const updateSettings = useAppStore((state) => state.updateSettings);
  const overrideValue = useAppStore((state) => state.settings.themeOverrides[args.themeEditorMode][args.token] ?? "");
  const effectiveValue = overrideValue || PRESET_THEME_TOKENS[args.themeEditorMode][args.token];

  return (
    <div className="grid gap-3 rounded-xl border border-border/70 bg-background/60 p-4 lg:grid-cols-[190px_52px_1fr_auto] lg:items-center">
      <div>
        <p className="text-sm font-medium">{formatThemeTokenLabel(args.token)}</p>
        <p className="text-xs text-muted-foreground">Preset: {PRESET_THEME_TOKENS[args.themeEditorMode][args.token]}</p>
      </div>
      <span className="size-11 rounded-lg border border-border" style={{ backgroundColor: effectiveValue }} aria-hidden="true" />
      <Input
        className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
        value={overrideValue}
        placeholder={PRESET_THEME_TOKENS[args.themeEditorMode][args.token]}
        onChange={(event) => {
          const themeOverrides = useAppStore.getState().settings.themeOverrides;
          updateSettings({
            patch: {
              themeOverrides: {
                ...themeOverrides,
                [args.themeEditorMode]: {
                  ...themeOverrides[args.themeEditorMode],
                  [args.token]: event.target.value,
                },
              },
            },
          });
        }}
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          const themeOverrides = useAppStore.getState().settings.themeOverrides;
          updateSettings({
            patch: {
              themeOverrides: {
                ...themeOverrides,
                [args.themeEditorMode]: {
                  ...themeOverrides[args.themeEditorMode],
                  [args.token]: "",
                },
              },
            },
          });
        }}
      >
        Reset
      </Button>
    </div>
  );
});

function TerminalSection() {
  const [terminalFontSize, terminalFontFamily, terminalCursorStyle, terminalLineHeight] = useAppStore(
    useShallow((state) => [
      state.settings.terminalFontSize,
      state.settings.terminalFontFamily,
      state.settings.terminalCursorStyle,
      state.settings.terminalLineHeight,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Terminal" description="Configure terminal appearance and behavior." />
      <SectionStack>
        <SettingsCard title="Typography" description="Tune readability for the integrated terminal.">
          <LabeledField title="Font Size">
            <Input
              className="h-10 rounded-md border-border/80 bg-background"
              value={String(terminalFontSize)}
              onChange={(event) =>
                updateSettings({
                  patch: { terminalFontSize: readInt(event.target.value, terminalFontSize) },
                })
              }
            />
          </LabeledField>
          <LabeledField title="Font Family">
            <Input
              className="h-10 rounded-md border-border/80 bg-background"
              value={terminalFontFamily}
              onChange={(event) => updateSettings({ patch: { terminalFontFamily: event.target.value } })}
            />
          </LabeledField>
          <LabeledField title="Line Height">
            <Input
              className="h-10 rounded-md border-border/80 bg-background"
              value={String(terminalLineHeight)}
              onChange={(event) =>
                updateSettings({
                  patch: { terminalLineHeight: readFloat(event.target.value, terminalLineHeight) },
                })
              }
            />
          </LabeledField>
        </SettingsCard>

        <SettingsCard title="Cursor" description="Choose the terminal cursor shape.">
          <ChoiceButtons
            value={terminalCursorStyle}
            columns={3}
            onChange={(value) => updateSettings({ patch: { terminalCursorStyle: value } })}
            options={[
              { value: "block", label: "Block" },
              { value: "bar", label: "Bar" },
              { value: "underline", label: "Underline" },
            ]}
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function ModelsSection() {
  const [modelClaude, modelCodex] = useAppStore(
    useShallow((state) => [state.settings.modelClaude, state.settings.modelCodex] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Models" description="Set the default model routing used for new turns." />
      <SectionStack>
        <SettingsCard title="Model Routing" description="Verified model set only. Claude is limited to latest official models; Codex supports the latest Stave-supported IDs.">
          <LabeledField title="Claude">
            <Input
              className="h-10 rounded-md border-border/80 bg-background"
              list="claude-model-options"
              value={modelClaude}
              onChange={(event) => updateSettings({ patch: { modelClaude: event.target.value } })}
              onBlur={(event) =>
                updateSettings({
                  patch: {
                    modelClaude: normalizeModelSelection({
                      value: event.target.value,
                      fallback: getDefaultModelForProvider({ providerId: "claude-code" }),
                    }),
                  },
                })
              }
            />
          </LabeledField>
          <LabeledField title="Codex">
            <Input
              className="h-10 rounded-md border-border/80 bg-background"
              list="codex-model-options"
              value={modelCodex}
              onChange={(event) => updateSettings({ patch: { modelCodex: event.target.value } })}
              onBlur={(event) =>
                updateSettings({
                  patch: {
                    modelCodex: normalizeModelSelection({
                      value: event.target.value,
                      fallback: getDefaultModelForProvider({ providerId: "codex" }),
                    }),
                  },
                })
              }
            />
          </LabeledField>
          <datalist id="claude-model-options">
            {CLAUDE_SDK_MODEL_OPTIONS.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
          <datalist id="codex-model-options">
            {CODEX_SDK_MODEL_OPTIONS.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function RulesSection() {
  const [rulesPresetPrimary, rulesPresetSecondary] = useAppStore(
    useShallow((state) => [state.settings.rulesPresetPrimary, state.settings.rulesPresetSecondary] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Rules" description="Default rule presets injected into provider runs." />
      <SectionStack>
        <SettingsCard title="Rule Presets" description="Primary and secondary presets are appended to new task turns.">
          <Input
            className="h-10 rounded-md border-border/80 bg-background"
            value={rulesPresetPrimary}
            onChange={(event) => updateSettings({ patch: { rulesPresetPrimary: event.target.value } })}
          />
          <Input
            className="h-10 rounded-md border-border/80 bg-background"
            value={rulesPresetSecondary}
            onChange={(event) => updateSettings({ patch: { rulesPresetSecondary: event.target.value } })}
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function ChatSection() {
  const [smartSuggestions, chatSendPreview, chatStreamingEnabled, messageFontSize, messageCodeFontSize] = useAppStore(
    useShallow((state) => [
      state.settings.smartSuggestions,
      state.settings.chatSendPreview,
      state.settings.chatStreamingEnabled,
      state.settings.messageFontSize,
      state.settings.messageCodeFontSize,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Chat" description="Adjust how the compose box and message stream behave." />
      <SectionStack>
        <SettingsCard title="Chat Defaults" description="These apply to the shared chat surface across tasks.">
          <LabeledField
            title="Message Font Size"
            description="Controls the prose size for chat messages. Tailwind sizes are shown with their exact pixel value."
          >
            <ChoiceButtons
              value={messageFontSize}
              columns={3}
              onChange={(value) => updateSettings({ patch: { messageFontSize: value } })}
              options={[
                { value: "base", label: formatChatFontSizeLabel("base") },
                { value: "lg", label: formatChatFontSizeLabel("lg") },
                { value: "xl", label: formatChatFontSizeLabel("xl") },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Message Code Font Size"
            description="Controls inline code and code blocks in chat messages. Default is Base · 16px."
          >
            <ChoiceButtons
              value={messageCodeFontSize}
              columns={3}
              onChange={(value) => updateSettings({ patch: { messageCodeFontSize: value } })}
              options={[
                { value: "base", label: formatChatFontSizeLabel("base") },
                { value: "lg", label: formatChatFontSizeLabel("lg") },
                { value: "xl", label: formatChatFontSizeLabel("xl") },
              ]}
            />
          </LabeledField>
          <LabeledField title="Smart Suggestions">
            <ChoiceButtons
              value={smartSuggestions ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { smartSuggestions: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Send Preview">
            <ChoiceButtons
              value={chatSendPreview ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { chatSendPreview: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Streaming UI">
            <ChoiceButtons
              value={chatStreamingEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { chatStreamingEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function PermissionsSection() {
  const permissionMode = useAppStore((state) => state.settings.permissionMode);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Permissions" description="Choose the baseline approval policy used for new tasks." />
      <SectionStack>
        <SettingsCard title="Permission Defaults" description="This sets the general Stave-side permission mode.">
          <ChoiceButtons
            value={permissionMode}
            onChange={(value) => updateSettings({ patch: { permissionMode: value } })}
            options={[
              { value: "require-approval", label: "Require Approval" },
              { value: "auto-safe", label: "Auto Approve Safe" },
            ]}
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function SubagentsSection() {
  const [subagentsEnabled, subagentsProfile] = useAppStore(
    useShallow((state) => [state.settings.subagentsEnabled, state.settings.subagentsProfile] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Subagent" description="Default behavior for skill and helper-agent delegation." />
      <SectionStack>
        <SettingsCard title="Subagent Defaults" description="Control whether subagents are offered by default and which profile they use.">
          <LabeledField title="Enabled">
            <ChoiceButtons
              value={subagentsEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { subagentsEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Profile">
            <Input
              className="h-10 rounded-md border-border/80 bg-background"
              value={subagentsProfile}
              onChange={(event) => updateSettings({ patch: { subagentsProfile: event.target.value } })}
            />
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function SkillsSection() {
  const [skillsEnabled, skillsAutoSuggest] = useAppStore(
    useShallow((state) => [state.settings.skillsEnabled, state.settings.skillsAutoSuggest] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Skills" description="Configure discovery and auto-suggestion of installed skills." />
      <SectionStack>
        <SettingsCard title="Skills Defaults" description="These settings control skill suggestions and automatic prompting.">
          <LabeledField title="Enabled">
            <ChoiceButtons
              value={skillsEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { skillsEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Auto Suggest">
            <ChoiceButtons
              value={skillsAutoSuggest ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { skillsAutoSuggest: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function CommandsSection() {
  const [commandPolicy, commandAllowlist, customCommands] = useAppStore(
    useShallow((state) => [
      state.settings.commandPolicy,
      state.settings.commandAllowlist,
      state.settings.customCommands,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Command" description="Control Stave-local slash commands and provider passthrough behavior." />
      <SectionStack>
        <SettingsCard title="Command Defaults" description="`/stave:*` commands are handled locally by Stave. Claude-native commands are validated against the current SDK catalog before passthrough; Codex slash commands are still forwarded unchanged.">
          <LabeledField title="Command Policy">
            <ChoiceButtons
              value={commandPolicy}
              onChange={(value) => updateSettings({ patch: { commandPolicy: value } })}
              options={[
                { value: "confirm", label: "Confirm" },
                { value: "auto-safe", label: "Auto Safe" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Allowlist">
            <Input
              className="h-10 rounded-md border-border/80 bg-background"
              value={commandAllowlist}
              onChange={(event) => updateSettings({ patch: { commandAllowlist: event.target.value } })}
            />
          </LabeledField>
          <LabeledField
            title="Custom Commands"
            description="One per line. Format: `/stave:name = response` or `/stave:name => response`. Legacy `/name` entries are normalized into the Stave namespace."
          >
            <Textarea
              className="min-h-[140px] rounded-md border-border/80 bg-background font-mono text-sm"
              value={customCommands}
              onChange={(event) => updateSettings({ patch: { customCommands: event.target.value } })}
              placeholder="/stave:clear = @clear&#10;/stave:hello = Hello from {provider} ({model})&#10;/stave:stats = Users: {user_count}, Assistant: {assistant_count}"
            />
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function ReviewSection() {
  const [reviewStrictMode, reviewChecklistPreset] = useAppStore(
    useShallow((state) => [state.settings.reviewStrictMode, state.settings.reviewChecklistPreset] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Review" description="Review-mode defaults used for code and change review flows." />
      <SectionStack>
        <SettingsCard title="Review Defaults" description="Tighten review output or switch to a different checklist preset.">
          <LabeledField title="Strict Mode">
            <ChoiceButtons
              value={reviewStrictMode ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { reviewStrictMode: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Checklist Preset">
            <Input
              className="h-10 rounded-md border-border/80 bg-background"
              value={reviewChecklistPreset}
              onChange={(event) => updateSettings({ patch: { reviewChecklistPreset: event.target.value } })}
            />
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function EditorSection() {
  const [editorFontSize, editorFontFamily, editorWordWrap, editorMinimap, editorLineNumbers, editorTabSize] = useAppStore(
    useShallow((state) => [
      state.settings.editorFontSize,
      state.settings.editorFontFamily,
      state.settings.editorWordWrap,
      state.settings.editorMinimap,
      state.settings.editorLineNumbers,
      state.settings.editorTabSize,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Editor" description="Configure code editor defaults used by tabs and previews." />
      <SectionStack>
        <SettingsCard title="Typography" description="Base editor type and spacing defaults.">
          <LabeledField title="Font Size">
            <Input
              className="h-10 rounded-md border-border/80 bg-background"
              type="number"
              min={10}
              max={32}
              value={String(editorFontSize)}
              onChange={(event) =>
                updateSettings({
                  patch: { editorFontSize: readInt(event.target.value, editorFontSize) },
                })
              }
            />
          </LabeledField>
          <LabeledField title="Font Family">
            <Input
              className="h-10 rounded-md border-border/80 bg-background font-mono"
              value={editorFontFamily}
              onChange={(event) => updateSettings({ patch: { editorFontFamily: event.target.value } })}
            />
          </LabeledField>
          <LabeledField title="Tab Size">
            <Input
              className="h-10 rounded-md border-border/80 bg-background"
              type="number"
              min={1}
              max={8}
              value={String(editorTabSize)}
              onChange={(event) =>
                updateSettings({
                  patch: { editorTabSize: readInt(event.target.value, editorTabSize) },
                })
              }
            />
          </LabeledField>
        </SettingsCard>

        <SettingsCard title="Display" description="Toggle editor line wrapping and chrome.">
          <LabeledField title="Word Wrap">
            <ChoiceButtons
              value={editorWordWrap ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { editorWordWrap: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Line Numbers">
            <ChoiceButtons
              value={editorLineNumbers}
              columns={3}
              onChange={(value) => updateSettings({ patch: { editorLineNumbers: value } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
                { value: "relative", label: "Relative" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Minimap">
            <ChoiceButtons
              value={editorMinimap ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { editorMinimap: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function ProvidersSection() {
  const [
    providerTimeoutMs,
    claudePermissionMode,
    claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands,
    claudeEffort,
    claudeThinkingMode,
    codexSandboxMode,
    codexNetworkAccessEnabled,
    codexApprovalPolicy,
    codexModelReasoningEffort,
    codexWebSearchMode,
    codexShowRawAgentReasoning,
    codexReasoningSummary,
    codexSupportsReasoningSummaries,
  ] = useAppStore(
    useShallow((state) => [
      state.settings.providerTimeoutMs,
      state.settings.claudePermissionMode,
      state.settings.claudeAllowDangerouslySkipPermissions,
      state.settings.claudeSandboxEnabled,
      state.settings.claudeAllowUnsandboxedCommands,
      state.settings.claudeEffort,
      state.settings.claudeThinkingMode,
      state.settings.codexSandboxMode,
      state.settings.codexNetworkAccessEnabled,
      state.settings.codexApprovalPolicy,
      state.settings.codexModelReasoningEffort,
      state.settings.codexWebSearchMode,
      state.settings.codexShowRawAgentReasoning,
      state.settings.codexReasoningSummary,
      state.settings.codexSupportsReasoningSummaries,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

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
                <SelectItem value="60000">1 min (60s)</SelectItem>
                <SelectItem value="120000">2 min (120s)</SelectItem>
                <SelectItem value="300000">5 min (300s)</SelectItem>
                <SelectItem value="600000">10 min (600s)</SelectItem>
                <SelectItem value="1200000">20 min (1200s)</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{providerTimeoutMs / 1000}s</span>
          </div>
        </SettingsCard>

        <SettingsCard title="Claude Runtime Controls" description="Permission and sandbox behavior passed into each Claude turn.">
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
                <SelectItem value="default">default</SelectItem>
                <SelectItem value="acceptEdits">acceptEdits</SelectItem>
                <SelectItem value="bypassPermissions">bypassPermissions</SelectItem>
                <SelectItem value="plan">plan</SelectItem>
                <SelectItem value="dontAsk">dontAsk</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField title="Dangerous Skip Permissions">
            <ChoiceButtons
              value={claudeAllowDangerouslySkipPermissions ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeAllowDangerouslySkipPermissions: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Sandbox Enabled">
            <ChoiceButtons
              value={claudeSandboxEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeSandboxEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Allow Unsandboxed Commands">
            <ChoiceButtons
              value={claudeAllowUnsandboxedCommands ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeAllowUnsandboxedCommands: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
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
                <SelectItem value="adaptive">adaptive</SelectItem>
                <SelectItem value="enabled">enabled</SelectItem>
                <SelectItem value="disabled">disabled</SelectItem>
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
                <SelectItem value="low">low</SelectItem>
                <SelectItem value="medium">medium</SelectItem>
                <SelectItem value="high">high</SelectItem>
                <SelectItem value="max">max</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
        </SettingsCard>

        <SettingsCard title="Codex Runtime Controls" description="Per-turn Codex sandbox, approval, reasoning, and web-search settings.">
          <LabeledField title="Network Access">
            <ChoiceButtons
              value={codexNetworkAccessEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexNetworkAccessEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
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
                <SelectItem value="read-only">read-only</SelectItem>
                <SelectItem value="workspace-write">workspace-write</SelectItem>
                <SelectItem value="danger-full-access">danger-full-access</SelectItem>
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
                <SelectItem value="never">never</SelectItem>
                <SelectItem value="on-request">on-request</SelectItem>
                <SelectItem value="untrusted">untrusted</SelectItem>
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
                <SelectItem value="minimal">minimal</SelectItem>
                <SelectItem value="low">low</SelectItem>
                <SelectItem value="medium">medium</SelectItem>
                <SelectItem value="high">high</SelectItem>
                <SelectItem value="xhigh">xhigh</SelectItem>
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
                <SelectItem value="auto">auto</SelectItem>
                <SelectItem value="concise">concise</SelectItem>
                <SelectItem value="detailed">detailed</SelectItem>
                <SelectItem value="none">none</SelectItem>
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
                <SelectItem value="auto">auto</SelectItem>
                <SelectItem value="enabled">enabled</SelectItem>
                <SelectItem value="disabled">disabled</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField title="Raw Agent Reasoning">
            <ChoiceButtons
              value={codexShowRawAgentReasoning ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexShowRawAgentReasoning: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
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
                <SelectItem value="disabled">disabled</SelectItem>
                <SelectItem value="cached">cached</SelectItem>
                <SelectItem value="live">live</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function DeveloperSection() {
  const [codexPathOverride, providerDebugStream, turnDiagnosticsVisible] = useAppStore(
    useShallow((state) => [state.settings.codexPathOverride, state.settings.providerDebugStream, state.settings.turnDiagnosticsVisible] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Developer" description="Advanced diagnostics and local provider tooling overrides." />
      <SectionStack>
        <SettingsCard title="Codex Binary Path" description="Override the path to the local `codex` binary. Leave empty to use the system install discovered from your PATH/home bin locations.">
          <Input
            className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
            placeholder="/usr/local/bin/codex"
            value={codexPathOverride}
            onChange={(event) => updateSettings({ patch: { codexPathOverride: event.target.value } })}
          />
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <TriangleAlert className="size-4 text-warning" />
              Supported Codex baseline
            </p>
            <p className="mt-1">
              Stave targets Codex SDK `0.113.0` and expects a local `codex` CLI around `0.113.0`.
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
          title="Turn Diagnostics UI"
          description="Shows recent persisted provider-turn diagnostics above the active chat session."
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

export function SettingsDialogSectionContent(args: { sectionId: SectionId }) {
  switch (args.sectionId) {
    case "general":
      return <GeneralSection />;
    case "theme":
      return <ThemeSection />;
    case "terminal":
      return <TerminalSection />;
    case "chat":
      return <ChatSection />;
    case "subagents":
      return <SubagentsSection />;
    case "skills":
      return <SkillsSection />;
    case "commands":
      return <CommandsSection />;
    case "editor":
      return <EditorSection />;
    case "providers":
      return <ProvidersSection />;
    case "developer":
      return <DeveloperSection />;
    default:
      return null;
  }
}
