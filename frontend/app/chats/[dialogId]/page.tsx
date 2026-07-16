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
import { Avatar, Button, Card, CardContent, Input, Label } from "@/components/ui";
import { EmojiPickerButton } from "@/components/ui/EmojiPickerButton";
import { LinkifiedText } from "@/components/ui/LinkifiedText";

type GroupMember = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  is_admin: boolean;
  is_banned: boolean;
  ban_reason: string | null;
  banned_until: string | null;
};

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
  const [chatAppearance, setChatAppearance] = useState("default");
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [banMessage, setBanMessage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const aesKeyRef = useRef<CryptoKey | null>(null);

  const other = dialog?.participants.find((p) => p.id !== user?.id);
  const audioCallsEnabled = user?.calls_audio_enabled !== false;
  const videoCallsEnabled = user?.calls_video_enabled !== false;
  const canModerate = !!dialog?.can_moderate;
  const isBanned = !!dialog?.is_banned;

  useEffect(() => {
    const fromUser = user?.chat_appearance;
    const fromStorage =
      typeof window !== "undefined" ? localStorage.getItem("vortexm_chat_appearance") : null;
    setChatAppearance(fromUser || fromStorage || "default");
  }, [user?.chat_appearance]);

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
    setBanMessage(d.ban_message || null);
    setEditTitle(d.title || "");
    setEditDescription(d.description || "");
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
    if (user && dialogId) {
      load().catch(() =>
        router.push(dialog?.is_group ? "/messages?tab=groups" : "/messages?tab=chats")
      );
    }
  }, [user, dialogId, load, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const { startCall } = useCallActions();

  const { sendTyping } = useWebSocket((event) => {
    if (event.type === "group_ban" && event.data) {
      const data = event.data as { dialog_id?: string; message?: string };
      if (data.dialog_id === dialogId) {
        setBanMessage(data.message || t("groups.bannedGeneric"));
        setDialog((prev) => (prev ? { ...prev, is_banned: true, ban_message: data.message || null } : prev));
      }
    }
    if (event.type === "group_unban" && event.data) {
      const data = event.data as { dialog_id?: string };
      if (data.dialog_id === dialogId) {
        setBanMessage(null);
        setDialog((prev) =>
          prev ? { ...prev, is_banned: false, ban_message: null, ban_reason: null } : prev
        );
      }
    }
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
    router.push(dialog?.is_group ? "/messages?tab=groups" : "/messages?tab=chats");
  };

  const backHref = dialog?.is_group ? "/messages?tab=groups" : "/messages?tab=chats";

  const openMembers = async () => {
    setHeaderMenuOpen(false);
    setMembersOpen(true);
    setSettingsOpen(false);
    if (dialog?.is_group) {
      try {
        setGroupMembers(await api.getGroupMembers(dialogId));
      } catch {
        setGroupMembers([]);
      }
    }
  };

  const openSettings = () => {
    setHeaderMenuOpen(false);
    setSettingsOpen(true);
    setMembersOpen(false);
  };

  const leaveGroup = async () => {
    setHeaderMenuOpen(false);
    try {
      await api.leaveGroup(dialogId);
      router.push("/messages?tab=groups");
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const saveGroupSettings = async () => {
    try {
      await api.updateGroup(dialogId, {
        title: editTitle.trim(),
        description: editDescription,
      });
      await load();
      setSettingsOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const onGroupAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await api.uploadGroupAvatar(dialogId, file);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("auth.error"));
    } finally {
      e.target.value = "";
    }
  };

  const banMember = async (userId: string, reason: "spam" | "ads" | "disrespect") => {
    try {
      await api.banGroupMember(dialogId, userId, reason);
      setGroupMembers(await api.getGroupMembers(dialogId));
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const unbanMember = async (userId: string) => {
    try {
      await api.unbanGroupMember(dialogId, userId);
      setGroupMembers(await api.getGroupMembers(dialogId));
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    }
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

  const renderContent = (m: ChatMessage) => {
    const raw = displayContent(m);
    if (!raw || m.is_deleted || dialog?.is_secret) return raw;
    return <LinkifiedText text={raw} />;
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
        <header className="sticky top-0 z-30 flex items-center gap-2 px-3 py-2 border-b border-border bg-background/95 backdrop-blur shrink-0">
          <Link
            href={backHref}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            ←
          </Link>
          {dialog.is_group ? (
            <Avatar src={dialog.avatar_url || null} name={dialog.title || "G"} className="h-9 w-9 shrink-0" />
          ) : (
            other && (
              <Avatar
                src={other.avatar_url}
                name={other.display_name || other.username}
                className="h-9 w-9"
                online={otherOnline}
              />
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
              <p className="text-xs text-muted-foreground">
                {dialog.member_count} {t("groups.membersCount")}
              </p>
            )}
            {!dialog.is_group && presenceLabel() && (
              <p className="text-xs text-primary">{presenceLabel()}</p>
            )}
          </div>
          {dialog.is_group ? (
            <div className="relative shrink-0" ref={headerMenuRef}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-2"
                onClick={() => setHeaderMenuOpen((v) => !v)}
              >
                ⋮
              </Button>
              {headerMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border bg-background shadow-lg z-40 py-1">
                  {canModerate && (
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                      onClick={openSettings}
                    >
                      {t("groups.settings")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onClick={openMembers}
                  >
                    {t("groups.members")}
                  </button>
                  {dialog.my_role !== "owner" && (
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-muted"
                      onClick={leaveGroup}
                    >
                      {t("groups.leave")}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-1 shrink-0">
              <Button variant="outline" size="sm" onClick={deleteChat} title={t("chats.deleteChat")}>
                🗑
              </Button>
              {audioCallsEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startCall(dialogId, "audio")}
                  title={t("calls.audioCall")}
                >
                  📞
                </Button>
              )}
              {videoCallsEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startCall(dialogId, "video")}
                  title={t("calls.videoCall")}
                >
                  📹
                </Button>
              )}
            </div>
          )}
        </header>

        {dialog.is_group && (settingsOpen || membersOpen) && (
          <div className="overflow-y-auto max-h-[40%] border-b border-border shrink-0 px-3 py-3 space-y-3">
            {settingsOpen && canModerate && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-medium">{t("groups.settings")}</h2>
                    <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(false)}>
                      {t("profile.cancel")}
                    </Button>
                  </div>
                  <div className="flex items-center gap-3">
                    <Avatar
                      src={dialog.avatar_url || null}
                      name={dialog.title || "G"}
                      className="h-14 w-14"
                    />
                    <div>
                      <input
                        ref={avatarRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={onGroupAvatar}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => avatarRef.current?.click()}
                      >
                        {t("groups.changeAvatar")}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label>{t("groups.name")}</Label>
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </div>
                  <div>
                    <Label>{t("profile.bio")}</Label>
                    <Input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                    />
                  </div>
                  <Button onClick={saveGroupSettings} disabled={!editTitle.trim()}>
                    {t("groups.saveSettings")}
                  </Button>
                </CardContent>
              </Card>
            )}

            {membersOpen && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-medium">{t("groups.members")}</h2>
                    <Button variant="ghost" size="sm" onClick={() => setMembersOpen(false)}>
                      {t("profile.cancel")}
                    </Button>
                  </div>
                  {groupMembers.map((m) => (
                    <div
                      key={m.user_id}
                      className="border border-border rounded-md px-3 py-2 space-y-2"
                    >
                      <div className="text-sm">
                        <span className="font-medium">@{m.username}</span>
                        <span className="text-xs text-muted-foreground ml-2">({m.role})</span>
                        {m.is_banned && (
                          <span className="ml-2 text-xs text-destructive">{t("groups.banned")}</span>
                        )}
                      </div>
                      {canModerate && m.role !== "owner" && m.user_id !== user?.id && (
                        <div className="flex flex-wrap gap-1">
                          {m.is_banned ? (
                            <Button size="sm" variant="outline" onClick={() => unbanMember(m.user_id)}>
                              {t("groups.unban")}
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" onClick={() => banMember(m.user_id, "spam")}>
                                {t("groups.banSpam")}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => banMember(m.user_id, "ads")}>
                                {t("groups.banAds")}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => banMember(m.user_id, "disrespect")}
                              >
                                {t("groups.banForever")}
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {groupMembers.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("groups.membersEmpty")}</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div
          className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 ${
            chatAppearance === "compact"
              ? "text-sm space-y-1.5"
              : chatAppearance === "bubbles"
                ? "space-y-2"
                : ""
          }`}
        >
          {messages.map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] px-3 py-2 text-sm ${
                    chatAppearance === "bubbles" ? "rounded-2xl" : "rounded-lg"
                  } ${
                    chatAppearance === "compact" ? "py-1 px-2 text-xs" : ""
                  } ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}
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
                  <p className="whitespace-pre-wrap break-words">{renderContent(m)}</p>
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

        {isBanned ? (
          <div className="px-4 py-4 border-t border-border shrink-0 bg-destructive/10">
            <p className="text-sm text-center text-destructive">
              {banMessage || dialog.ban_message || t("groups.bannedGeneric")}
            </p>
          </div>
        ) : (
          <>
            {replyTo && (
              <div className="px-4 py-1 bg-muted/50 flex items-center justify-between text-sm">
                <span className="truncate">↩ {displayContent(replyTo)}</span>
                <button onClick={() => setReplyTo(null)}>✕</button>
              </div>
            )}

            <div className="px-4 py-3 border-t border-border flex gap-2 shrink-0 items-end">
              <input ref={fileRef} type="file" className="hidden" onChange={() => send()} />
              <Button variant="outline" size="icon" onClick={() => fileRef.current?.click()}>
                📎
              </Button>
              <EmojiPickerButton onPick={(emoji) => setText((prev) => prev + emoji)} title={t("chats.emoji")} />
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t("chats.messagePlaceholder")}
                className="flex-1"
              />
              <Button onClick={send} disabled={sending}>
                {sending ? "..." : t("chats.send")}
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground pb-2">{t("chats.sendHint")}</p>
          </>
        )}
      </div>
    </AppShell>
  );
}
