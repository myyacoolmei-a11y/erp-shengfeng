import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  fetchUnreadCount,
  fetchInAppNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeWebPush,
  type InAppNotificationDto,
} from "@/lib/notificationsApi";

const NOTIFICATIONS_KEY = ["in-app-notifications"];
const UNREAD_KEY = ["notifications-unread-count"];

function NotificationItem({
  item,
  onRead,
}: {
  item: InAppNotificationDto;
  onRead: (item: InAppNotificationDto) => void;
}) {
  const unread = !item.readAt;
  return (
    <button
      type="button"
      className={`w-full text-left px-3 py-2.5 border-b last:border-0 hover:bg-muted/60 transition-colors ${unread ? "bg-blue-50/50" : ""}`}
      onClick={() => onRead(item)}
    >
      <p className="text-sm font-medium leading-snug">{item.title}</p>
      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.body}</p>
      <p className="text-[10px] text-muted-foreground/80 mt-1">
        {new Date(item.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
      </p>
    </button>
  );
}

export function NotificationBell() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: fetchUnreadCount,
    refetchInterval: 30_000,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: fetchInAppNotifications,
    enabled: open,
  });

  const readMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      qc.invalidateQueries({ queryKey: UNREAD_KEY });
    },
  });

  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      qc.invalidateQueries({ queryKey: UNREAD_KEY });
    },
  });

  useEffect(() => {
    void subscribeWebPush().catch(() => { /* optional */ });
  }, []);

  function handleItemClick(item: InAppNotificationDto) {
    if (!item.readAt) readMutation.mutate(item.id);
    const url = item.payload?.url ?? (item.payload?.workOrderId ? `/work-orders?open=${item.payload.workOrderId}` : null);
    if (url) {
      setOpen(false);
      navigate(url);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative shrink-0" title="通知">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">通知</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => readAllMutation.mutate()}
              disabled={readAllMutation.isPending}
            >
              全部已讀
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-4 text-center">載入中…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">尚無通知</p>
          ) : (
            items.map(item => (
              <NotificationItem key={item.id} item={item} onRead={handleItemClick} />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
