import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { findLatestPendingApproval } from "@/store/provider-message.utils";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

const EMPTY_MESSAGES: ChatMessage[] = [];

export function TaskAutoApproval() {
  const [activeTaskId, autoApproveToolRequests, resolveApproval] = useAppStore(useShallow((state) => [
    state.activeTaskId,
    // Legacy persisted key name. The user-facing behavior is tool approval auto-approve.
    state.settings.planAutoApprove,
    state.resolveApproval,
  ] as const));

  const [pendingApprovalMessageId, pendingApprovalRequestId] = useAppStore(useShallow((state) => {
    const messages = state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES;
    const pendingApproval = findLatestPendingApproval({ messages });
    return [
      pendingApproval?.messageId ?? null,
      pendingApproval?.part.requestId ?? null,
    ] as const;
  }));

  const attemptedApprovalKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingApprovalMessageId || !pendingApprovalRequestId) {
      attemptedApprovalKeyRef.current = null;
      return;
    }

    if (!autoApproveToolRequests || !activeTaskId) {
      attemptedApprovalKeyRef.current = null;
      return;
    }

    const approvalKey = `${activeTaskId}:${pendingApprovalMessageId}:${pendingApprovalRequestId}`;
    if (attemptedApprovalKeyRef.current === approvalKey) {
      return;
    }

    attemptedApprovalKeyRef.current = approvalKey;
    resolveApproval({
      taskId: activeTaskId,
      messageId: pendingApprovalMessageId,
      approved: true,
    });
  }, [
    activeTaskId,
    autoApproveToolRequests,
    pendingApprovalMessageId,
    pendingApprovalRequestId,
    resolveApproval,
  ]);

  return null;
}
