"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useWebSocket } from "@/hooks/useWebSocket";
import { api, type DialogListItem } from "@/lib/api";
import { Avatar, Button, Card, CardContent, Input } from "@/components/ui";

export function ChatsPanel() {
  const { t } = useTranslation();
  const router = useRouter();
  const [dialogs, setDialogs] = useState<DialogListItem[]>([]);
  const [search, setSearch] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [searchResults, setSearchResults] = useState<
    { message: { content: string | null }; dialog_id: string; other_username: string | null }[]
  >([]);

  const loadDialogs = () => {
    api
      .getDialogs()
      .then((list) => setDialogs(list.filter((d) => !d.is_group)))
      .catch(() => {});
  };

  useEffect(() => {
    loadDialogs();
  }, []);

  useWebSocket((event) => {
    if (["message_new", "message_edit", "message_delete", "message_read"].includes(event.type)) {
      loadDialogs();
    }
  });

  const startChat = async () => {
    if (!newUsername.trim()) return;
    try {
      const dialog = await api.createDialog(newUsername.trim());
      router.push(`/chats/${dialog.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const startSecretChat = async () => {
    if (!newUsername.trim()) return;
    try {
      const dialog = await api.createDialog(newUsername.trim(), true);
      router.push(`/chats/${dialog.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const doSearch = async () => {
    if (!search.trim()) return;
    const res = await api.searchMessages(search.trim());
    setSearchResults(res.results);
  };

  const totalUnread = dialogs.reduce((s, d) => s + d.unread_count, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-lg font-semibold">
          {t("chats.title")}
          {totalUnread > 0 && (
            <span className="ml-2 text-sm bg-primary text-primary-foreground px-2 py-0.5 rounded-full">{totalUnread}</span>
          )}
        </h2>
      </div>

      <Card className="mb-4 border-primary/30">
        <CardContent className="pt-4 space-y-2">
          <p className="text-sm font-medium text-primary">{t("chats.newChat")}</p>
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder={t("chats.newChatUsername")}
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startChat()}
              className="flex-1 min-w-[140px]"
            />
            <Button onClick={startChat}>{t("chats.startChat")}</Button>
            <Button variant="outline" onClick={startSecretChat} title={t("chats.secretChat")}>
              {t("chats.secretChat")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={t("chats.searchMessages")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
            />
            <Button variant="outline" onClick={doSearch}>
              {t("chats.search")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {searchResults.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-sm text-muted-foreground">{t("chats.searchResults")}</p>
          {searchResults.map((r, i) => (
            <Link
              key={i}
              href={`/chats/${r.dialog_id}`}
              className="block p-3 border border-border rounded-lg hover:border-primary/50"
            >
              <span className="text-sm text-muted-foreground">@{r.other_username}</span>
              <p className="text-sm truncate">{r.message.content}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {dialogs.map((d) => (
          <Link
            key={d.id}
            href={`/chats/${d.id}`}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
          >
            {d.other_user && (
              <Avatar
                src={d.other_user.avatar_url}
                name={d.other_user.display_name || d.other_user.username}
                className="h-12 w-12"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium truncate">
                  {d.is_secret && "🔒 "}
                  {d.other_user?.display_name || d.other_user?.username || "?"}
                </span>
                {d.last_message_at && (
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {new Date(d.last_message_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">{d.last_message_preview || t("chats.noMessages")}</p>
            </div>
            {d.unread_count > 0 && (
              <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full shrink-0">
                {d.unread_count}
              </span>
            )}
          </Link>
        ))}
        {dialogs.length === 0 && <p className="text-center text-muted-foreground py-8">{t("chats.empty")}</p>}
      </div>
    </div>
  );
}
