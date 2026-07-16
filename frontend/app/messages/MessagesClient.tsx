"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadSummary } from "@/hooks/useUnreadSummary";
import { ChatsPanel } from "@/components/messages/ChatsPanel";
import { ChannelsPanel } from "@/components/messages/ChannelsPanel";
import { GroupsPanel } from "@/components/messages/GroupsPanel";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "chats", key: "chats" },
  { id: "channels", key: "channels" },
  { id: "groups", key: "groups" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTab(value: string | null): value is TabId {
  return value === "chats" || value === "channels" || value === "groups";
}

function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1.5 min-w-[1.15rem] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold inline-flex items-center justify-center tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function MessagesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const { summary } = useUnreadSummary(!!user && !loading);

  const tab: TabId = useMemo(() => {
    const raw = searchParams.get("tab");
    return isTab(raw) ? raw : "chats";
  }, [searchParams]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  const setTab = (next: TabId) => {
    router.replace(`/messages?tab=${next}`, { scroll: false });
  };

  const tabCounts: Record<TabId, number> = {
    chats: summary.chats,
    channels: summary.channels,
    groups: summary.groups,
  };

  if (loading || !user) {
    return (
      <AppShell>
        <div className="animate-pulse text-muted-foreground">...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold mb-4">{t("nav.messages")}</h1>

      <div className="flex gap-1 p-1 mb-6 rounded-xl bg-muted/50 border border-border overflow-x-auto">
        {TABS.map(({ id, key }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 min-w-[6.5rem] px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap inline-flex items-center justify-center",
              tab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(`nav.${key}`)}
            <TabBadge count={tabCounts[id]} />
          </button>
        ))}
      </div>

      {tab === "chats" && <ChatsPanel />}
      {tab === "channels" && <ChannelsPanel />}
      {tab === "groups" && <GroupsPanel />}
    </AppShell>
  );
}
