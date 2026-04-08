import { resolveStaveProviderForModel } from "../../src/lib/providers/stave-auto-profile";
import { getCachedAvailability } from "./stave-availability";

export const STAVE_MODEL_FALLBACK: Record<string, string> = {
  "claude-opus-4-6": "gpt-5.4",
  "claude-opus-4-6[1m]": "claude-opus-4-6",
  "claude-sonnet-4-6": "gpt-5.4",
  "claude-sonnet-4-6[1m]": "claude-sonnet-4-6",
  "claude-haiku-4-5": "gpt-5.3-codex",
  "gpt-5.4": "claude-opus-4-6",
  "gpt-5.3-codex": "claude-haiku-4-5",
  "opusplan": "claude-opus-4-6",
};

export function resolveAvailableStaveModel(args: { model: string }): string {
  const providerId = resolveStaveProviderForModel({ model: args.model });
  if (getCachedAvailability(providerId) !== false) {
    return args.model;
  }

  return STAVE_MODEL_FALLBACK[args.model] ?? args.model;
}
