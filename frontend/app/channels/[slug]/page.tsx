"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import {
  api,
  type ChannelInfo,
  type ChannelMember,
  type ChannelPost,
  type ChannelPostComment,
  type ChannelVerificationRequest,
} from "@/lib/api";
import { LinkifiedText } from "@/components/ui/LinkifiedText";
import { VerifiedBadge } from "@/components/profile/DisplayNameWithBadge";
import { Avatar, Button, Card, CardContent, Input, Label, Textarea } from "@/components/ui";
import { EmojiPickerButton } from "@/components/ui/EmojiPickerButton";

export default function ChannelPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { user, loading } = useAuth();
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [verification, setVerification] = useState<ChannelVerificationRequest | null>(null);
  const [postText, setPostText] = useState("");
  const [pollOptions, setPollOptions] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [postType, setPostType] = useState("text");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVisibility, setEditVisibility] = useState("public");
  const [editPrice, setEditPrice] = useState("0");
  const [verifyReason, setVerifyReason] = useState("");
  const [verifyWebsite, setVerifyWebsite] = useState("");
  const [verifySocial, setVerifySocial] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, ChannelPostComment[]>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentLoading, setCommentLoading] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const ch = await api.getChannel(slug);
      setChannel(ch);
      setEditTitle(ch.title);
      setEditDescription(ch.description || "");
      setEditVisibility(ch.visibility);
      setEditPrice(String(ch.subscription_price || 0));
      if (ch.is_owner && !ch.is_verified) {
        api.getChannelVerification(slug).then(setVerification).catch(() => setVerification(null));
      } else {
        setVerification(null);
      }
      if (ch.can_manage_members || ch.is_owner) {
        api.getChannelMembers(slug).then(setMembers).catch(() => setMembers([]));
      }
    } catch {
      router.push("/messages?tab=channels");
      return;
    }
    try {
      const list = await api.getChannelPosts(slug);
      setPosts(list);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user && slug) load();
  }, [user, slug]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (headerMenuRef.current && !headerMenuRef.current.contains(target)) {
        setHeaderMenuOpen(false);
      }
      if (typeMenuRef.current && !typeMenuRef.current.contains(target)) {
        setTypeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [posts.length]);

  const toggleJoin = async () => {
    if (!channel) return;
    setHeaderMenuOpen(false);
    try {
      if (channel.is_member) {
        await api.leaveChannel(slug);
        router.push("/messages?tab=channels");
        return;
      }
      await api.joinChannel(slug);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const publish = async () => {
    setMessage(null);
    if (postType === "poll") {
      const options = pollOptions
        .split("|")
        .map((o) => o.trim())
        .filter(Boolean);
      if (options.length < 2) {
        setMessage(t("channels.pollOptionsRequired"));
        return;
      }
    } else if (!postText.trim() && !attachFile) {
      setMessage(t("channels.emptyPost"));
      return;
    }
    setPublishing(true);
    try {
      const form = new FormData();
      form.append("post_type", postType === "text" && attachFile ? "media" : postType);
      if (postText.trim()) form.append("content", postText.trim());
      if (postType === "poll") {
        const options = pollOptions
          .split("|")
          .map((o) => o.trim())
          .filter(Boolean);
        form.append("poll_options", options.join("|"));
      }
      if (postType === "event") {
        if (eventStartsAt) form.append("event_starts_at", new Date(eventStartsAt).toISOString());
        if (eventLocation.trim()) form.append("event_location", eventLocation.trim());
      }
      if (attachFile) form.append("file", attachFile);
      const created = await api.createChannelPost(slug, form);
      setPostText("");
      setPollOptions("");
      setEventStartsAt("");
      setEventLocation("");
      setAttachFile(null);
      setPostType("text");
      if (fileRef.current) fileRef.current.value = "";
      setPosts((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setPublishing(false);
    }
  };

  const vote = async (postId: string, optionId: string) => {
    setMessage(null);
    try {
      const updated = await api.votePoll(postId, optionId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const deletePost = async (postId: string) => {
    setMessage(null);
    try {
      await api.deleteChannelPost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setCommentsByPost((prev) => {
        const next = { ...prev };
        delete next[postId];
        return next;
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const toggleComments = async (postId: string) => {
    const nextOpen = !openComments[postId];
    setOpenComments((prev) => ({ ...prev, [postId]: nextOpen }));
    if (!nextOpen || commentsByPost[postId]) return;
    setCommentLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      const list = await api.getChannelPostComments(postId);
      setCommentsByPost((prev) => ({ ...prev, [postId]: list }));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setCommentLoading((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const sendComment = async (postId: string) => {
    const text = (commentDrafts[postId] || "").trim();
    if (!text) return;
    setCommentLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      const created = await api.addChannelComment(postId, text);
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] || []), created],
      }));
      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p))
      );
      setOpenComments((prev) => ({ ...prev, [postId]: true }));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setCommentLoading((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const sendBroadcast = async () => {
    if (!broadcastText.trim()) return;
    try {
      await api.sendBroadcast(slug, broadcastText, true);
      setBroadcastText("");
      setMessage(t("channels.broadcastSent"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const saveSettings = async () => {
    if (!channel) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateChannel(slug, {
        title: editTitle.trim(),
        description: editDescription,
        visibility: editVisibility,
        subscription_price: Number(editPrice) || 0,
      });
      setChannel(updated);
      setSettingsOpen(false);
      setMessage(t("channels.settingsSaved"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setSaving(false);
    }
  };

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const updated = await api.uploadChannelAvatar(slug, file);
      setChannel(updated);
      setMessage(t("channels.avatarUpdated"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("auth.error"));
    } finally {
      setSaving(false);
      e.target.value = "";
    }
  };

  const setMemberRole = async (userId: string, role: string) => {
    setMessage(null);
    try {
      await api.updateChannelMember(slug, userId, role);
      setMembers(await api.getChannelMembers(slug));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const transferOwnership = async (userId: string) => {
    if (!confirm(t("channels.transferConfirm"))) return;
    setMessage(null);
    try {
      await api.transferChannelOwnership(slug, userId);
      await load();
      setMessage(t("channels.ownershipTransferred"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const submitVerification = async () => {
    setMessage(null);
    try {
      const req = await api.submitChannelVerification(slug, {
        reason: verifyReason.trim(),
        link_website: verifyWebsite.trim() || undefined,
        link_social: verifySocial.trim() || undefined,
      });
      setVerification(req);
      setVerifyReason("");
      setVerifyWebsite("");
      setVerifySocial("");
      setMessage(t("channels.verificationSubmitted"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const openMembers = () => {
    setHeaderMenuOpen(false);
    setMembersOpen(true);
    setSettingsOpen(false);
    if (!members.length) {
      api.getChannelMembers(slug).then(setMembers).catch(() => {});
    }
  };

  const openSettings = () => {
    setHeaderMenuOpen(false);
    setSettingsOpen(true);
    setMembersOpen(false);
  };

  const canManage = !!channel && (channel.is_owner || (user && channel.owner_id === user.id));
  const canPost = !!channel && (channel.can_post || canManage);
  const canManageMembers = !!channel?.can_manage_members || canManage;
  const canEditSettings = canManage || canPost || channel?.my_role === "admin";
  const canPin =
    !!channel &&
    (canManage ||
      canPost ||
      !!channel.can_pin ||
      channel.my_role === "admin" ||
      channel.my_role === "owner");
  const pinnedPost = posts.find((p) => p.is_pinned) || null;

  const scrollToPost = (postId: string) => {
    const el = document.getElementById(`channel-post-${postId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1500);
    }
  };

  const togglePinPost = async (post: ChannelPost) => {
    try {
      if (post.is_pinned) {
        await api.unpinChannelPost(post.id);
      } else {
        await api.pinChannelPost(post.id);
      }
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const postTypeLabel =
    postType === "poll"
      ? t("channels.postPoll")
      : postType === "event"
        ? t("channels.postEvent")
        : t("channels.postText");

  if (loading || !channel) {
    return (
      <AppShell>
        <div className="animate-pulse">...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-8rem)] -mx-4 sm:-mx-6">
        {/* Sticky channel header */}
        <header className="sticky top-0 z-30 flex items-center gap-2 px-3 py-2 border-b border-border bg-background/95 backdrop-blur shrink-0">
          <Link
            href="/messages?tab=channels"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label={t("channels.back")}
          >
            ←
          </Link>
          <Avatar src={channel.avatar_url} name={channel.title} className="h-9 w-9 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate flex items-center gap-1.5">
              <span className="truncate">{channel.title}</span>
              {channel.is_verified && <VerifiedBadge className="h-4 w-4 text-[10px]" />}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {channel.subscriber_count} {t("channels.subscribers")}
            </p>
          </div>
          <div className="relative shrink-0" ref={headerMenuRef}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-2"
              onClick={() => setHeaderMenuOpen((v) => !v)}
              aria-label={t("channels.menu")}
            >
              ⋮
            </Button>
            {headerMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border bg-background shadow-lg z-40 py-1">
                {canEditSettings && (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onClick={openSettings}
                  >
                    {t("channels.settings")}
                  </button>
                )}
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                  onClick={openMembers}
                >
                  {t("channels.members")}
                </button>
                {channel.is_member ? (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-muted"
                    onClick={toggleJoin}
                  >
                    {t("channels.leave")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onClick={toggleJoin}
                  >
                    {channel.subscription_price > 0
                      ? `${t("channels.join")} (${channel.subscription_price} ₽)`
                      : t("channels.join")}
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        {pinnedPost && (
          <button
            type="button"
            onClick={() => scrollToPost(pinnedPost.id)}
            className="w-full text-left px-3 py-2 border-b border-border bg-primary/5 hover:bg-primary/10 shrink-0 flex items-center gap-2"
          >
            <span className="text-primary shrink-0">📌</span>
            <span className="text-sm truncate flex-1">
              {pinnedPost.content_locked
                ? t("channels.lockedPost")
                : pinnedPost.content || t("channels.pinnedPost")}
            </span>
          </button>
        )}

        {message && (
          <p className="px-4 py-2 text-sm text-muted-foreground border-b border-border shrink-0">{message}</p>
        )}

        {/* Panels: settings / members / verification */}
        {(settingsOpen || membersOpen || (channel.is_owner && !channel.is_verified)) && (
          <div className="overflow-y-auto max-h-[40%] border-b border-border shrink-0 px-3 py-3 space-y-3">
            {settingsOpen && canEditSettings && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-medium">{t("channels.settings")}</h2>
                    <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(false)}>
                      {t("profile.cancel")}
                    </Button>
                  </div>
                  <div className="flex items-center gap-3">
                    <Avatar src={channel.avatar_url} name={channel.title} className="h-14 w-14" />
                    <div>
                      <input
                        ref={avatarRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={onAvatarChange}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saving}
                        onClick={() => avatarRef.current?.click()}
                      >
                        {t("channels.changeAvatar")}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label>{t("channels.name")}</Label>
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </div>
                  <div>
                    <Label>{t("profile.bio")}</Label>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label>{t("channels.visibility")}</Label>
                    <select
                      className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={editVisibility}
                      onChange={(e) => setEditVisibility(e.target.value)}
                    >
                      <option value="public">{t("channels.public")}</option>
                      <option value="closed">{t("channels.closed")}</option>
                    </select>
                  </div>
                  <div>
                    <Label>{t("channels.subscriptionPrice")}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                    />
                  </div>
                  {canManage && (
                    <div className="border-t border-border pt-3 space-y-2">
                      <Label>{t("channels.broadcast")}</Label>
                      <Input
                        placeholder={t("channels.broadcastPlaceholder")}
                        value={broadcastText}
                        onChange={(e) => setBroadcastText(e.target.value)}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={sendBroadcast}>
                        @all
                      </Button>
                    </div>
                  )}
                  <Button onClick={saveSettings} disabled={saving || !editTitle.trim()}>
                    {t("channels.saveSettings")}
                  </Button>
                </CardContent>
              </Card>
            )}

            {membersOpen && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-medium">{t("channels.members")}</h2>
                    <Button variant="ghost" size="sm" onClick={() => setMembersOpen(false)}>
                      {t("profile.cancel")}
                    </Button>
                  </div>
                  {members.map((m) => (
                    <div
                      key={m.user_id}
                      className="flex flex-wrap items-center justify-between gap-2 border border-border rounded-md px-3 py-2"
                    >
                      <div className="text-sm">
                        <span className="font-medium">@{m.username}</span>
                        {m.display_name && (
                          <span className="text-muted-foreground"> · {m.display_name}</span>
                        )}
                        <span className="text-xs text-muted-foreground ml-2">({m.role})</span>
                      </div>
                      {canManageMembers && m.role !== "owner" && (
                        <div className="flex flex-wrap gap-2">
                          {m.role !== "admin" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setMemberRole(m.user_id, "admin")}
                            >
                              {t("channels.makeAdmin")}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setMemberRole(m.user_id, "subscriber")}
                            >
                              {t("channels.makeSubscriber")}
                            </Button>
                          )}
                          {channel.is_owner && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => transferOwnership(m.user_id)}
                            >
                              {t("channels.transferOwnership")}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {members.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("channels.membersEmpty")}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {channel.is_owner && !channel.is_verified && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <h2 className="font-medium">{t("channels.requestVerification")}</h2>
                  {verification?.status === "pending" ? (
                    <p className="text-sm text-muted-foreground">{t("channels.verificationPending")}</p>
                  ) : verification?.status === "rejected" ? (
                    <p className="text-sm text-destructive">
                      {t("channels.verificationRejected")}
                      {verification.admin_note ? `: ${verification.admin_note}` : ""}
                    </p>
                  ) : null}
                  {(!verification || verification.status === "rejected") && (
                    <>
                      <Textarea
                        value={verifyReason}
                        onChange={(e) => setVerifyReason(e.target.value)}
                        rows={2}
                        placeholder={t("channels.verificationReasonHint")}
                      />
                      <Input
                        placeholder={t("channels.verificationWebsite")}
                        value={verifyWebsite}
                        onChange={(e) => setVerifyWebsite(e.target.value)}
                      />
                      <Input
                        placeholder={t("channels.verificationSocial")}
                        value={verifySocial}
                        onChange={(e) => setVerifySocial(e.target.value)}
                      />
                      <Button
                        onClick={submitVerification}
                        disabled={verifyReason.trim().length < 20}
                      >
                        {t("channels.submitVerification")}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Posts feed */}
        <div ref={feedRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {posts.map((post) => (
            <Card
              key={post.id}
              id={`channel-post-${post.id}`}
              className={post.is_pinned ? "border-primary scroll-mt-24" : "scroll-mt-24"}
            >
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  {post.is_announcement && <span className="text-primary">📢</span>}
                  {post.is_pinned && <span>📌</span>}
                  <span className="ml-auto" />
                  {canPin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      className="h-7 px-2"
                      onClick={() => togglePinPost(post)}
                      title={post.is_pinned ? t("channels.unpin") : t("channels.pin")}
                    >
                      {post.is_pinned ? t("channels.unpin") : "📌"}
                    </Button>
                  )}
                  {((canManage || (user && post.author_id === user.id)) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      className="h-7 px-2 text-destructive"
                      onClick={() => deletePost(post.id)}
                    >
                      {t("channels.deletePost")}
                    </Button>
                  ))}
                </div>
                {post.content_locked ? (
                  <div className="flex items-center gap-2">
                    <span>
                      🔒 {t("channels.lockedPost")} ({post.price})
                    </span>
                    <Button
                      size="sm"
                      type="button"
                      onClick={() =>
                        api
                          .unlockPost(post.id)
                          .then((updated) =>
                            setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)))
                          )
                          .catch((e) => setMessage(e instanceof Error ? e.message : t("auth.error")))
                      }
                    >
                      {t("channels.unlock")}
                    </Button>
                  </div>
                ) : (
                  <>
                    {post.content && <LinkifiedText text={post.content} />}
                    {post.media_url && (
                      <img
                        src={post.media_url}
                        alt=""
                        className="mt-2 rounded-lg max-h-64 object-cover"
                      />
                    )}
                    {post.poll_options.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {post.poll_options.map((opt) => {
                          const selected = post.my_vote_option_id === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              className={`block w-full text-left px-3 py-2 rounded-md border text-sm ${
                                selected
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:border-primary"
                              }`}
                              onClick={() => vote(post.id, opt.id)}
                            >
                              {opt.text} ({opt.votes_count})
                              {selected ? ` · ${t("channels.yourVote")}` : ""}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {post.event && (
                      <p className="text-sm text-muted-foreground mt-2">
                        📅 {new Date(post.event.starts_at).toLocaleString()}
                        {post.event.location && ` · ${post.event.location}`}
                      </p>
                    )}
                  </>
                )}

                {channel.is_member && (
                  <div className="mt-3 border-t border-border pt-3 space-y-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => toggleComments(post.id)}
                    >
                      {openComments[post.id] ? t("channels.hideComments") : t("channels.showComments")}
                      {typeof post.comments_count === "number" ? ` (${post.comments_count})` : ""}
                    </Button>

                    {openComments[post.id] && (
                      <div className="space-y-2">
                        {commentLoading[post.id] && !commentsByPost[post.id] ? (
                          <p className="text-xs text-muted-foreground">...</p>
                        ) : (commentsByPost[post.id] || []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t("channels.noComments")}</p>
                        ) : (
                          (commentsByPost[post.id] || []).map((c) => (
                            <div key={c.id} className="text-sm rounded-md bg-muted/40 px-2 py-1.5">
                              <Link
                                href={`/users/${c.author_username}`}
                                className="text-xs text-muted-foreground hover:underline"
                              >
                                @{c.author_username}
                              </Link>
                              <p className="mt-0.5 whitespace-pre-wrap break-words">{c.content}</p>
                            </div>
                          ))
                        )}
                        <div className="flex gap-2">
                          <Input
                            value={commentDrafts[post.id] || ""}
                            onChange={(e) =>
                              setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                            }
                            placeholder={t("channels.commentPlaceholder")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                sendComment(post.id);
                              }
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={commentLoading[post.id] || !(commentDrafts[post.id] || "").trim()}
                            onClick={() => sendComment(post.id)}
                          >
                            {t("channels.sendComment")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {posts.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">{t("channels.noPosts")}</p>
          )}
        </div>

        {/* Composer like chat */}
        {canPost ? (
          <div className="border-t border-border bg-background shrink-0 px-2 py-2 space-y-2">
            {(postType === "poll" || postType === "event" || attachFile) && (
              <div className="px-1 space-y-2">
                {postType !== "text" && (
                  <p className="text-xs text-muted-foreground">
                    {t("channels.postingAs")}: {postTypeLabel}
                  </p>
                )}
                {postType === "poll" && (
                  <Input
                    placeholder={t("channels.pollOptionsHint")}
                    value={pollOptions}
                    onChange={(e) => setPollOptions(e.target.value)}
                  />
                )}
                {postType === "event" && (
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="datetime-local"
                      value={eventStartsAt}
                      onChange={(e) => setEventStartsAt(e.target.value)}
                      className="flex-1 min-w-[160px]"
                    />
                    <Input
                      placeholder={t("channels.eventLocation")}
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      className="flex-1 min-w-[120px]"
                    />
                  </div>
                )}
                {attachFile && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{attachFile.name}</span>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        setAttachFile(null);
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                    >
                      {t("profile.cancel")}
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-end gap-1.5">
              <div className="relative shrink-0" ref={typeMenuRef}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="px-2 h-10"
                  onClick={() => setTypeMenuOpen((v) => !v)}
                  title={t("channels.postType")}
                >
                  ⚙
                </Button>
                {typeMenuOpen && (
                  <div className="absolute left-0 bottom-full mb-1 w-44 rounded-lg border border-border bg-background shadow-lg z-40 py-1">
                    {[
                      { value: "text", label: t("channels.postText") },
                      { value: "poll", label: t("channels.postPoll") },
                      { value: "event", label: t("channels.postEvent") },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                          postType === opt.value ? "text-primary font-medium" : ""
                        }`}
                        onClick={() => {
                          setPostType(opt.value);
                          setTypeMenuOpen(false);
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setAttachFile(e.target.files?.[0] || null)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="px-2 h-10 shrink-0"
                onClick={() => fileRef.current?.click()}
                title={t("channels.attach")}
              >
                📎
              </Button>
              <EmojiPickerButton
                onPick={(emoji) => setPostText((prev) => prev + emoji)}
                title={t("channels.emoji")}
              />
              <Input
                className="flex-1 min-w-0"
                placeholder={t("channels.postPlaceholder")}
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    publish();
                  }
                }}
              />
              <Button
                type="button"
                className="h-10 shrink-0"
                disabled={publishing}
                onClick={publish}
              >
                {t("channels.send")}
              </Button>
            </div>
          </div>
        ) : !channel.is_member ? (
          <div className="border-t border-border px-4 py-3 shrink-0">
            <Button className="w-full" onClick={toggleJoin}>
              {channel.subscription_price > 0
                ? `${t("channels.join")} (${channel.subscription_price} ₽)`
                : t("channels.join")}
            </Button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
