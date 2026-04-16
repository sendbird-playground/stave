import {
  getSdkModelOptions,
  inferProviderIdFromModel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

export interface ModelSelectorOption {
  key: string;
  providerId: ProviderId;
  model: string;
  label: string;
  available: boolean;
}

export function shouldOpenModelSelector(args: {
  openToken?: string | number;
  disabled?: boolean;
  lastHandledOpenToken?: string | number;
}) {
  if (args.openToken === undefined || args.disabled) {
    return false;
  }
  return args.openToken !== args.lastHandledOpenToken;
}

const DEFAULT_RECOMMENDED_MODEL_SELECTOR_KEYS = [
  "claude-code:claude-opus-4-6",
  "codex:gpt-5.4",
  "stave:stave-auto",
] as const;

function buildModelSelectorOption(args: {
  providerId: ProviderId;
  model: string;
  available?: boolean;
}): ModelSelectorOption {
  return {
    key: `${args.providerId}:${args.model}`,
    providerId: args.providerId,
    model: args.model,
    label: toHumanModelName({ model: args.model }),
    available: args.available ?? true,
  };
}

export function buildModelSelectorValue(args: {
  model: string;
  providerId?: ProviderId;
  available?: boolean;
}): ModelSelectorOption {
  return buildModelSelectorOption({
    providerId: args.providerId ?? inferProviderIdFromModel({ model: args.model }),
    model: args.model,
    available: args.available,
  });
}

export function buildModelSelectorOptions(args: {
  providerIds: readonly ProviderId[];
  availabilityByProvider?: Partial<Record<ProviderId, boolean>>;
}): ModelSelectorOption[] {
  return args.providerIds.flatMap((providerId) =>
    getSdkModelOptions({ providerId }).map((model) =>
      buildModelSelectorOption({
        providerId,
        model,
        available: args.availabilityByProvider?.[providerId] ?? true,
      })
    )
  );
}

export function buildRecommendedModelSelectorOptions(args: {
  options: readonly ModelSelectorOption[];
  recommendedKeys?: readonly string[];
}): ModelSelectorOption[] {
  const recommendedKeys = args.recommendedKeys ?? DEFAULT_RECOMMENDED_MODEL_SELECTOR_KEYS;
  const optionByKey = new Map(
    args.options
      .filter((option) => option.available)
      .map((option) => [option.key, option] as const),
  );

  return recommendedKeys
    .map((key) => optionByKey.get(key))
    .filter((option): option is ModelSelectorOption => option != null);
}
