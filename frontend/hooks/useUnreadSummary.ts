"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type UnreadSummary } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";

const EMPTY: UnreadSummary = { chats: 0, groups: 0, channels: 0, total: 0 };

export function useUnreadSummary(enabled = true) {
  const [summary, setSummary] = useState<UnreadSummary>(EMPTY);

  const load = useCallback(() => {
    if (!enabled) return;
    api
      .getUnreadSummary()
      .then((data) => {
        setSummary({
          chats: Number(data?.chats) || 0,
          groups: Number(data?.groups) || 0,
          channels: Number(data?.channels) || 0,
          total: Number(data?.total) || 0,
        });
      })
      .catch(() => {});
  }, [enabled]);

  useEffect(() => {
    load();
    if (!enabled) return;
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load, enabled]);

  useWebSocket((event) => {
    if (
      [
        "message_new",
        "message_read",
        "message_delete",
        "channel_post_new",
        "channel_notification",
        "message_pinned",
      ].includes(event.type)
    ) {
      load();
    }
  });

  return { summary, reload: load };
}
