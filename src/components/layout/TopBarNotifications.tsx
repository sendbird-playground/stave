import { Bell, CheckCheck } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { isNotificationUnread } from "@/lib/notifications/notification.types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

function getNotificationKindLabel(kind: "task.turn_completed" | "task.approval_requested") {
  return kind === "task.approval_requested" ? "Approval" : "Completed";
}

function getNotificationKindTone(kind: "task.turn_completed" | "task.approval_requested") {
  return kind === "task.approval_requested"
    ? "border-amber-500/30 bg-amber-500/12 text-amber-200"
    : "border-emerald-500/30 bg-emerald-500/12 text-emerald-200";
}

function buildLocationLabel(args: {
  projectName: string | null;
  workspaceName: string | null;
}) {
  return [args.projectName, args.workspaceName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" / ");
}

export function TopBarNotifications(props: {
  noDragStyle: CSSProperties;
}) {
  const [notifications, markAllNotificationsRead, openNotificationContext, resolveNotificationApproval] = useAppStore(
    useShallow((state) => [
      state.notifications,
      state.markAllNotificationsRead,
      state.openNotificationContext,
      state.resolveNotificationApproval,
    ] as const),
  );
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const unreadCount = notifications.filter(isNotificationUnread).length;
  const unreadCountLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  async function handleMarkAllRead() {
    setPendingActionId("mark-all");
    try {
      await markAllNotificationsRead();
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleOpenNotification(notificationId: string) {
    setPendingActionId(`open:${notificationId}`);
    try {
      await openNotificationContext({ notificationId });
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleResolveApproval(notificationId: string, approved: boolean) {
    setPendingActionId(`${approved ? "approve" : "deny"}:${notificationId}`);
    try {
      await resolveNotificationApproval({ notificationId, approved });
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="relative h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
              style={props.noDragStyle}
              aria-label="notifications"
            >
              <Bell className="size-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-background bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {unreadCountLabel}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Notifications
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(28rem,calc(100vw-1rem))] overflow-hidden rounded-xl border-border/80 bg-card p-0 shadow-2xl"
        style={props.noDragStyle}
      >
        <PopoverHeader className="border-b border-border/70 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PopoverTitle className="text-sm font-semibold text-foreground">
                Notifications
              </PopoverTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : "Everything is read."}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 px-2 text-xs"
              disabled={unreadCount === 0 || pendingActionId === "mark-all"}
              onClick={() => void handleMarkAllRead()}
            >
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          </div>
        </PopoverHeader>
        <div className="max-h-[min(70vh,40rem)] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">No notifications yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Task completions and approval requests will appear here.
              </p>
            </div>
          ) : (
            notifications.map((notification) => {
              const unread = isNotificationUnread(notification);
              const locationLabel = buildLocationLabel({
                projectName: notification.projectName,
                workspaceName: notification.workspaceName,
              });
              const approvalAction = notification.action?.type === "approval";

              return (
                <div
                  key={notification.id}
                  className={cn(
                    "border-b border-border/60 last:border-b-0",
                    unread && "bg-primary/[0.04]",
                  )}
                >
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/40"
                    onClick={() => void handleOpenNotification(notification.id)}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          unread ? "bg-primary shadow-[0_0_0_4px_rgba(255,255,255,0.03)]" : "bg-border/90",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn("rounded-sm border text-[10px] font-medium uppercase tracking-[0.18em]", getNotificationKindTone(notification.kind))}
                          >
                            {getNotificationKindLabel(notification.kind)}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {formatTaskUpdatedAt({ value: notification.createdAt })}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-sm font-medium text-foreground">
                          {notification.title}
                        </p>
                        <p className="mt-1 break-words text-sm text-muted-foreground">
                          {notification.body}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {locationLabel ? (
                            <span className="rounded-sm border border-border/60 bg-background/70 px-1.5 py-0.5">
                              {locationLabel}
                            </span>
                          ) : null}
                          {notification.taskTitle ? (
                            <span className="truncate">
                              {notification.taskTitle}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                  {approvalAction ? (
                    <div className="flex items-center justify-end gap-2 px-4 pb-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={pendingActionId === `approve:${notification.id}` || pendingActionId === `deny:${notification.id}`}
                        onClick={() => void handleResolveApproval(notification.id, false)}
                      >
                        Deny
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8"
                        disabled={pendingActionId === `approve:${notification.id}` || pendingActionId === `deny:${notification.id}`}
                        onClick={() => void handleResolveApproval(notification.id, true)}
                      >
                        Approve
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
