"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { api, type ChatMessage, type DialogDetail } from "@/lib/api";
import { DisplayNameWithBadge } from "@/components/profile/DisplayNameWithBadge";
import {
  decryptMessage as decryptE2E,
  encryptMessage as encryptE2E,
  exportPublicKeyB64,
  getOrCreateDialogKeys,
  getSharedAesKey,
} from "@/lib/e2e";
import { useCallActions } from "@/components/calls/CallProvider";
import { Avatar, Button, Input } from "@/components/ui";

export default function ChatPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const dialogId = params.dialogId as string;
  const { user, loading } = useAuth();
  const [dialog, setDialog] = useState<DialogDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const [otherOnline, setOtherOnline] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const aesKeyRef = useRef<CryptoKey | null>(null);

  const other = dialog?.participants.find((p) => p.id !== user?.id);

  const decryptMessages = useCallback(
    async (msgs: ChatMessage[], detail: DialogDetail) => {
      if (!detail.is_secret || !user) return;
      const otherP = detail.participants.find((p) => p.id !== user.id);
      if (!otherP?.e2e_public_key) return;
      try {
        const aesKey = await getSharedAesKey(dialogId, otherP.e2e_public_key);
        aesKeyRef.current = aesKey;
        const map: Record<string, string> = {};
        for (const m of msgs) {
          if (m.content_e2e) {
            try {
              map[m.id] = await decryptE2E(aesKey, m.content_e2e);
            } catch {
              map[m.id] = "🔒";
            }
          }
        }
        setDecrypted(map);
      } catch {
        /* keys not ready */
      }
    },
    [dialogId, user]
  );

  const setupE2E = useCallback(async (detail: DialogDetail, msgs: ChatMessage[]) => {
    if (!detail.is_secret || !user) return;
    const pair = await getOrCreateDialogKeys(dialogId);
    const pubB64 = await exportPublicKeyB64(pair.publicKey);
    const me = detail.participants.find((p) => p.id === user.id);
    if (!me?.e2e_public_key) {
      await api.setE2EKey(dialogId, pubB64);
    }
    await decryptMessages(msgs, detail);
  }, [dialogId, user, decryptMessages]);

  const load = useCallback(async () => {
    const [d, m] = await Promise.all([api.getDialog(dialogId), api.getMessages(dialogId)]);
    setDialog(d);
    setMessages(m.messages);
    const otherP = d.participants.find((p) => p.id !== user?.id);
    setOtherReadAt(otherP?.last_read_at || null);
    setOtherOnline(otherP?.is_online || false);
    await api.markDialogRead(dialogId);
    await setupE2E(d, m.messages);
  }, [dialogId, setupE2E, user?.id]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user && dialogId) load().catch(() => router.push("/messages?tab=chats"));
  }, [user, dialogId, load, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const { startCall } = useCallActions();

  const { sendTyping } = useWebSocket((event) => {
    if (event.type === "message_new" && event.data) {
      const msg = event.data as unknown as ChatMessage;
      if (msg.dialog_id === dialogId) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        if (dialog?.is_secret && msg.content_e2e && aesKeyRef.current) {
          decryptE2E(aesKeyRef.current, msg.content_e2e).then((plain) =>
            setDecrypted((d) => ({ ...d, [msg.id]: plain }))
          );
        }
        api.markDialogRead(dialogId);
      }
    }
    if (event.type === "message_edit" && event.data) {
      const msg = event.data as unknown as ChatMessage;
      if (msg.dialog_id === dialogId) {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      }
    }
    if (event.type === "message_delete" && event.data) {
      const data = event.data as { id: string };
      setMessages((prev) =>
        prev.map((m) => (m.id === data.id ? { ...m, is_deleted: true, content: null } : m))
      );
    }
    if (event.type === "message_read" && event.dialog_id === dialogId && event.user_id !== user?.id) {
      const at = (event as { last_read_at?: string }).last_read_at;
      setOtherReadAt(at || new Date().toISOString());
    }
    if (event.type === "presence_update" && event.user_id === other?.id && event.data) {
      const data = event.data as { is_online?: boolean; last_seen_at?: string };
      setOtherOnline(!!data.is_online);
      if (data.last_seen_at) setOtherReadAt((prev) => prev);
    }
    if (event.type === "typing" && event.dialog_id === dialogId && event.user_id !== user?.id) {
      setTyping(true);
      setTimeout(() => setTyping(false), 2000);
    }
    if (event.type === "e2e_key" && event.dialog_id === dialogId) {
      load();
    }
    if (event.type === "reaction_add" && event.data) {
      const data = event.data as { message_id: string; emoji: string; user_id: string; username: string };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.message_id
            ? { ...m, reactions: [...m.reactions, { emoji: data.emoji, user_id: data.user_id, username: data.username }] }
            : m
        )
      );
    }
  });

  const send = async () => {
    if (!text.trim() && !fileRef.current?.files?.length) return;
    if (sending) return;
    setSending(true);
    const plainText = text.trim();
    const file = fileRef.current?.files?.[0];
    let content: string | undefined = plainText || undefined;
    let content_e2e: string | undefined;
    let message_type = file ? (file.type.startsWith("audio/") ? "voice" : file.type.startsWith("video/") ? "video_note" : "file") : "text";

    try {
      if (dialog?.is_secret && content && aesKeyRef.current) {
        content_e2e = await encryptE2E(aesKeyRef.current, content);
        content = undefined;
      }

      const msg = await api.sendMessage(dialogId, {
        message_type,
        content,
        content_e2e,
        reply_to_id: replyTo?.id,
        file,
      });

      setMessages((prev) => [...prev, msg]);
      if (content_e2e) {
        setDecrypted((d) => ({ ...d, [msg.id]: plainText }));
      }
      setText("");
      setReplyTo(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setSending(false);
    }
  };

  const isRead = (m: ChatMessage) => {
    if (!otherReadAt || m.sender_id !== user?.id) return false;
    return new Date(m.created_at) <= new Date(otherReadAt);
  };

  const presenceLabel = () => {
    if (typing) return t("chats.typing");
    if (otherOnline) return t("chats.online");
    if (other?.last_seen_at) return t("chats.lastSeen", { time: new Date(other.last_seen_at).toLocaleString() });
    return null;
  };

  const deleteChat = async () => {
    if (!confirm(t("chats.deleteConfirm"))) return;
    await api.hideDialog(dialogId);
    router.push("/messages?tab=chats");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
    }
    sendTyping(dialogId);
  };

  const displayContent = (m: ChatMessage) => {
    if (m.is_deleted) return t("chats.deleted");
    if (dialog?.is_secret) return decrypted[m.id] || "🔒";
    return m.content;
  };

  if (loading || !user || !dialog) {
    return (
      <AppShell>
        <div className="animate-pulse text-muted-foreground">...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-8rem)] -mx-4 sm:-mx-6">
        <header className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
          <Link href="/messages?tab=chats" className="text-muted-foreground hover:text-foreground">←</Link>
          {dialog.is_group ? (
            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">👥</div>
          ) : (
            other && (
              <Avatar src={other.avatar_url} name={other.display_name || other.username} className="h-9 w-9" online={otherOnline} />
            )
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">
              {dialog.is_secret && "🔒 "}
              {dialog.is_group ? (
                dialog.title || t("groups.title")
              ) : other?.username ? (
                <Link href={`/users/${other.username}`} className="hover:underline">
                  <DisplayNameWithBadge
                    name={other.display_name || other.username}
                    verified={other.is_official_verified}
                  />
                </Link>
              ) : (
                <DisplayNameWithBadge
                  name={other?.display_name || other?.username || "?"}
                  verified={other?.is_official_verified}
                />
              )}
            </p>
            {dialog.is_group && dialog.member_count != null && (
              <p className="text-xs text-muted-foreground">{dialog.member_count} {t("groups.membersCount")}</p>
            )}
            {presenceLabel() && <p className="text-xs text-primary">{presenceLabel()}</p>}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="outline" size="sm" onClick={deleteChat} title={t("chats.deleteChat")}>
              🗑
            </Button>
            <Button variant="outline" size="sm" onClick={() => startCall(dialogId, "audio")} title={t("calls.audioCall")}>
              📞
            </Button>
            <Button variant="outline" size="sm" onClick={() => startCall(dialogId, "video")} title={t("calls.videoCall")}>
              📹
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    mine ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {dialog.is_group && !mine && (
                    <p className="text-xs font-medium opacity-80 mb-0.5">@{m.sender_username}</p>
                  )}
                  {m.reply_to && (
                    <p className="text-xs opacity-70 border-l-2 pl-2 mb-1 truncate">
                      {m.reply_to.content_preview || "..."}
                    </p>
                  )}
                  {m.media_url && m.message_type === "image" && (
                    <img src={m.media_url} alt="" className="max-w-full rounded mb-1" />
                  )}
                  {m.media_url && (m.message_type === "voice" || m.message_type === "video_note") && (
                    <audio src={m.media_url} controls className="max-w-full mb-1" />
                  )}
                  {m.media_url && m.message_type === "file" && (
                    <a href={m.media_url} target="_blank" rel="noreferrer" className="underline block mb-1">
                      📎 {m.file_name || t("chats.file")}
                    </a>
                  )}
                  <p>{displayContent(m)}</p>
                  {m.is_edited && <span className="text-xs opacity-60"> ({t("chats.edited")})</span>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs opacity-60">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {mine && !m.is_deleted && (
                      <span className="text-xs opacity-60" title={isRead(m) ? t("chats.read") : t("chats.sent")}>
                        {isRead(m) ? "✓✓" : "✓"}
                      </span>
                    )}
                    {m.reactions.map((r) => (
                      <button
                        key={r.emoji + r.user_id}
                        className="text-xs"
                        onClick={() =>
                          r.user_id === user.id
                            ? api.removeReaction(m.id, r.emoji).then(() =>
                                setMessages((prev) =>
                                  prev.map((msg) =>
                                    msg.id === m.id
                                      ? { ...msg, reactions: msg.reactions.filter((x) => !(x.user_id === user.id && x.emoji === r.emoji)) }
                                      : msg
                                  )
                                )
                              )
                            : api.addReaction(m.id, r.emoji)
                        }
                      >
                        {r.emoji}
                      </button>
                    ))}
                    <button className="text-xs opacity-60 hover:opacity-100" onClick={() => setReplyTo(m)}>
                      ↩
                    </button>
                    <button
                      className="text-xs opacity-60 hover:opacity-100"
                      onClick={() => api.addReaction(m.id, "👍")}
                    >
                      👍
                    </button>
                    {mine && !m.is_deleted && (
                      <>
                        <button
                          className="text-xs opacity-60 hover:opacity-100"
                          onClick={() => api.pinMessage(dialogId, m.id)}
                        >
                          📌
                        </button>
                        <button
                          className="text-xs opacity-60 hover:opacity-100"
                          onClick={() =>
                            api.deleteMessage(m.id).then(() =>
                              setMessages((prev) =>
                                prev.map((msg) => (msg.id === m.id ? { ...msg, is_deleted: true, content: null } : msg))
                              )
                            )
                          }
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {replyTo && (
          <div className="px-4 py-1 bg-muted/50 flex items-center justify-between text-sm">
            <span className="truncate">↩ {displayContent(replyTo)}</span>
            <button onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}

        <div className="px-4 py-3 border-t border-border flex gap-2 shrink-0">
          <input ref={fileRef} type="file" className="hidden" onChange={() => send()} />
          <Button variant="outline" size="icon" onClick={() => fileRef.current?.click()}>
            📎
          </Button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("chats.messagePlaceholder")}
            className="flex-1"
          />
          <Button onClick={send} disabled={sending}>{sending ? "..." : t("chats.send")}</Button>
        </div>
        <p className="text-xs text-center text-muted-foreground pb-2">{t("chats.sendHint")}</p>
      </div>
    </AppShell>
  );
}
