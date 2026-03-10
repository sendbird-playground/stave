import { buildLegacyPromptFromCanonicalRequest } from "@/lib/providers/canonical-request";
import type { CanonicalConversationRequest, ProviderId } from "@/lib/providers/provider.types";

function getResumeConversationId(conversation?: CanonicalConversationRequest) {
  const value = conversation?.resume?.nativeConversationId?.trim();
  return value ? value : undefined;
}

function shouldIncludeHistory(conversation: CanonicalConversationRequest) {
  return !getResumeConversationId(conversation);
}

export function buildClaudePromptFromConversation(args: {
  conversation: CanonicalConversationRequest;
  fallbackPrompt: string;
}) {
  return buildLegacyPromptFromCanonicalRequest({
    request: args.conversation,
    includeHistory: shouldIncludeHistory(args.conversation),
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
  const fallback = args.fallbackResumeId?.trim();
  if (fallback) {
    return fallback;
  }
  return getResumeConversationId(args.conversation);
}
