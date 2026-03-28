import { buildLegacyPromptFromCanonicalRequest } from "./canonical-request";
import type { CanonicalConversationRequest, ProviderId } from "./provider.types";

function getStoredResumeConversationId(conversation?: CanonicalConversationRequest) {
  const value = conversation?.resume?.nativeConversationId?.trim();
  return value ? value : undefined;
}

function getLatestTargetProviderModel(conversation: CanonicalConversationRequest) {
  for (let index = conversation.history.length - 1; index >= 0; index -= 1) {
    const message = conversation.history[index];
    if (!message || message.role !== "assistant") {
      continue;
    }
    if (message.providerId !== conversation.target.providerId) {
      continue;
    }
    const model = message.model?.trim();
    if (model) {
      return model;
    }
  }

  return undefined;
}

function isResumeCompatibleWithConversationTarget(conversation?: CanonicalConversationRequest) {
  if (!conversation || conversation.target.providerId !== "codex") {
    return true;
  }

  const targetModel = conversation.target.model?.trim();
  if (!targetModel) {
    return true;
  }

  const latestModel = getLatestTargetProviderModel(conversation);
  if (!latestModel) {
    return true;
  }

  return latestModel === targetModel;
}

function getResumeConversationId(conversation?: CanonicalConversationRequest) {
  const value = getStoredResumeConversationId(conversation);
  if (!value) {
    return undefined;
  }

  return isResumeCompatibleWithConversationTarget(conversation) ? value : undefined;
}

function shouldIncludeHistory(conversation: CanonicalConversationRequest) {
  return !getResumeConversationId(conversation);
}

export function buildClaudePromptFromConversation(args: {
  conversation: CanonicalConversationRequest;
  fallbackPrompt: string;
}) {
  // Include full skill instructions in the prompt body so the LLM can
  // execute them directly. Stave-managed skills are not registered in
  // Claude Code's native skill registry, so converting $token → /token
  // caused Claude Code to reject them as unknown slash commands.
  return buildLegacyPromptFromCanonicalRequest({
    request: args.conversation,
    includeHistory: shouldIncludeHistory(args.conversation),
    includeSkillContext: true,
  }) || args.fallbackPrompt;
}

export function buildCodexPromptFromConversation(args: {
  conversation: CanonicalConversationRequest;
  fallbackPrompt: string;
}) {
  return buildLegacyPromptFromCanonicalRequest({
    request: args.conversation,
    includeHistory: shouldIncludeHistory(args.conversation),
  }) || args.fallbackPrompt;
}

export function buildProviderTurnPrompt(args: {
  providerId: ProviderId;
  prompt: string;
  conversation?: CanonicalConversationRequest;
}) {
  if (!args.conversation) {
    return args.prompt;
  }

  if (args.providerId === "claude-code") {
    return buildClaudePromptFromConversation({
      conversation: args.conversation,
      fallbackPrompt: args.prompt,
    });
  }

  return buildCodexPromptFromConversation({
    conversation: args.conversation,
    fallbackPrompt: args.prompt,
  });
}

export function resolveProviderResumeConversationId(args: {
  conversation?: CanonicalConversationRequest;
  fallbackResumeId?: string;
}) {
  if (!isResumeCompatibleWithConversationTarget(args.conversation)) {
    return undefined;
  }

  const fallback = args.fallbackResumeId?.trim();
  if (fallback) {
    return fallback;
  }
  return getStoredResumeConversationId(args.conversation);
}
