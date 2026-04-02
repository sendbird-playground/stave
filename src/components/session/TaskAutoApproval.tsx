import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { findLatestPendingApproval } from "@/store/provider-message.utils";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

const EMPTY_MESSAGES: ChatMessage[] = [];

export function TaskAutoApproval() {
  const [activeTaskId, autoApproveToolRequests, resolveApproval, pendingApprovalMessageId, pendingApprovalRequestId] = useAppStore(useShallow((state) => {
    const autoApproveToolRequests = state.settings.planAutoApprove;
    const pendingApproval = autoApproveToolRequests
      ? findLatestPendingApproval({ messages: state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES })
      : null;
    return [
      state.activeTaskId,
      autoApproveToolRequests,
      state.resolveApproval,
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
