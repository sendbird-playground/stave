import {
  buildModelSelectorOptions,
  buildModelSelectorValue,
  buildRecommendedModelSelectorOptions,
  ModelSelector,
} from "@/components/ai-elements/model-selector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";
import {
  ChoiceButtons,
  LabeledField,
  SectionHeading,
  SectionStack,
  SettingsCard,
} from "./settings-dialog.shared";

const ASSISTANT_MODEL_PROVIDER_IDS = ["claude-code", "codex"] as const;
const ASSISTANT_ROLE_MODEL_OPTIONS = buildModelSelectorOptions({
  providerIds: ASSISTANT_MODEL_PROVIDER_IDS,
});
const ASSISTANT_RECOMMENDED_MODEL_OPTIONS = buildRecommendedModelSelectorOptions({
  options: ASSISTANT_ROLE_MODEL_OPTIONS,
});

function AssistantModelField(args: {
  title: string;
  description: string;
  value: string;
  onSelect: (model: string) => void;
}) {
  return (
    <LabeledField title={args.title} description={args.description}>
      <ModelSelector
        value={buildModelSelectorValue({ model: args.value })}
        options={ASSISTANT_ROLE_MODEL_OPTIONS}
        recommendedOptions={ASSISTANT_RECOMMENDED_MODEL_OPTIONS}
        className="w-full"
        triggerClassName="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40"
        menuClassName="sm:max-w-lg"
        onSelect={({ selection }) => args.onSelect(selection.model)}
      />
    </LabeledField>
  );
}

export function AssistantSection() {
  const [
    assistantDefaultTarget,
    assistantRouterModel,
    assistantChatModel,
    assistantPlannerModel,
    assistantAutoHandoffToTask,
    assistantAllowDirectWorkspaceInfoEdits,
  ] = useAppStore(useShallow((state) => [
    state.settings.assistantDefaultTarget,
    state.settings.assistantRouterModel,
    state.settings.assistantChatModel,
    state.settings.assistantPlannerModel,
    state.settings.assistantAutoHandoffToTask,
    state.settings.assistantAllowDirectWorkspaceInfoEdits,
  ] as const));
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <SectionStack>
      <SectionHeading
        title="Global control-plane assistant"
        description="Configure the app-wide assistant that explains Stave, navigates workspaces, edits the Information panel, and hands complex implementation work off into task chat."
      />

      <SettingsCard
        title="Behavior"
        description="These defaults affect the floating Stave Assistant widget and any assistant commands routed through it."
      >
        <LabeledField
          title="Default Target"
          description="Choose the default scope for new assistant conversations."
        >
          <Select
            value={assistantDefaultTarget}
            onValueChange={(value) => updateSettings({
              patch: {
                assistantDefaultTarget: value as "app" | "current-project" | "current-workspace",
              },
            })}
          >
            <SelectTrigger className="h-10 rounded-md border-border/80 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="app">App</SelectItem>
              <SelectItem value="current-project">Current Project</SelectItem>
              <SelectItem value="current-workspace">Current Workspace</SelectItem>
            </SelectContent>
          </Select>
        </LabeledField>

        <LabeledField
          title="Auto Handoff To Task"
          description="When the assistant detects implementation or git-heavy work, automatically create a task and continue there."
        >
          <ChoiceButtons
            value={assistantAutoHandoffToTask ? "on" : "off"}
            onChange={(value) => updateSettings({ patch: { assistantAutoHandoffToTask: value === "on" } })}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
        </LabeledField>

        <LabeledField
          title="Direct Information Edits"
          description="Allow the assistant to update notes, todos, links, and custom fields in the Information panel without creating a task."
        >
          <ChoiceButtons
            value={assistantAllowDirectWorkspaceInfoEdits ? "on" : "off"}
            onChange={(value) => updateSettings({ patch: { assistantAllowDirectWorkspaceInfoEdits: value === "on" } })}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
        </LabeledField>
      </SettingsCard>

      <SettingsCard
        title="Model Routing"
        description="Separate routing, chat, and planning roles so the assistant stays fast for app control while still handling heavier reasoning when needed."
      >
        <AssistantModelField
          title="Router Model"
          description="Lightweight classifier used to decide between direct chat, assistant planning, and task handoff."
          value={assistantRouterModel}
          onSelect={(model) => updateSettings({ patch: { assistantRouterModel: model } })}
        />
        <AssistantModelField
          title="Chat Model"
          description="Used for Stave questions, summaries, and direct control-plane requests that stay inside the assistant widget."
          value={assistantChatModel}
          onSelect={(model) => updateSettings({ patch: { assistantChatModel: model } })}
        />
        <AssistantModelField
          title="Planner Model"
          description="Used for more structured configuration, workflow planning, and multi-step assistant reasoning that should not enter task chat yet."
          value={assistantPlannerModel}
          onSelect={(model) => updateSettings({ patch: { assistantPlannerModel: model } })}
        />
      </SettingsCard>
    </SectionStack>
  );
}
