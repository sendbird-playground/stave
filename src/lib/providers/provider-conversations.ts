import type { TaskProviderConversationState } from "@/lib/db/workspaces.db";
import {
  getProviderConversationLabel as getProviderConversationLabelFromCatalog,
  listProviderIds,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

export const providerConversationOrder: ProviderId[] = listProviderIds();

export function getProviderConversationId(args: {
  conversations?: TaskProviderConversationState;
  providerId: ProviderId;
}): string | null {
  const value = args.conversations?.[args.providerId]?.trim();
  return value ? value : null;
}

export function listProviderConversations(args: {
  conversations?: TaskProviderConversationState;
}) {
  return providerConversationOrder.flatMap((providerId) => {
    const nativeConversationId = getProviderConversationId({
      conversations: args.conversations,
      providerId,
    });

    return nativeConversationId
      ? [{ providerId, nativeConversationId }]
      : [];
  });
}

export function getProviderConversationLabel(args: { providerId: ProviderId }) {
  return getProviderConversationLabelFromCatalog(args);
}
