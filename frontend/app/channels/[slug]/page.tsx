"use client";

import { useEffect, useState } from "react";
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
  type ChannelVerificationRequest,
} from "@/lib/api";
import { LinkifiedText } from "@/components/ui/LinkifiedText";
import { Button, Card, CardContent, Input, Label, Textarea } from "@/components/ui";

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
  const [postType, setPostType] = useState("text");
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
      if (ch.can_manage_members) {
        api.getChannelMembers(slug).then(setMembers).catch(() => setMembers([]));
      }
    } catch {
      router.push("/messages?tab=channels");
      return;
    }
    api.getChannelPosts(slug).then(setPosts).catch(() => {});
  };

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user && slug) load();
  }, [user, slug]);

  const toggleJoin = async () => {
    if (!channel) return;
    try {
      if (channel.is_member) {
        await api.leaveChannel(slug);
      } else {
        await api.joinChannel(slug);
      }
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
    }
    try {
      const form = new FormData();
      form.append("post_type", postType);
      if (postText) form.append("content", postText);
      if (postType === "poll") {
        const options = pollOptions
          .split("|")
          .map((o) => o.trim())
          .filter(Boolean);
        form.append("poll_options", options.join("|"));
      }
      await api.createChannelPost(slug, form);
      setPostText("");
      setPollOptions("");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
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

  const setMemberRole = async (userId: string, role: string) => {
    setMessage(null);
    try {
      await api.updateChannelMember(slug, userId, role);
      const list = await api.getChannelMembers(slug);
      setMembers(list);
      setMessage(t("channels.memberUpdated"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const transferOwnership = async (userId: string) => {
    if (!confirm(t("channels.transferConfirm"))) return;
    setMessage(null);
    try {
      const updated = await api.transferChannelOwnership(slug, userId);
      setChannel(updated);
      setMessage(t("channels.ownershipTransferred"));
      await load();
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

  const canManage = !!channel && (channel.is_owner || (user && channel.owner_id === user.id));
  const canPost = !!channel?.can_post;
  const canManageMembers = !!channel?.can_manage_members;

  if (loading || !channel) {
    return (
      <AppShell>
        <div className="animate-pulse">...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/messages?tab=channels" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t("channels.title")}
        </Link>
        <h1 className="text-2xl font-semibold mt-2 flex items-center gap-2">
          {channel.is_verified && <span className="text-primary">✓</span>}
          {channel.title}
        </h1>
        <p className="text-muted-foreground text-sm">
          @{channel.slug} · {channel.subscriber_count} {t("channels.subscribers")}
          {channel.my_role && ` · ${channel.my_role}`}
        </p>
        {channel.description && <p className="mt-2 text-sm">{channel.description}</p>}
        {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant={channel.is_member ? "outline" : "default"} onClick={toggleJoin}>
            {channel.is_member
              ? t("channels.leave")
              : channel.subscription_price > 0
                ? `${t("channels.join")} (${channel.subscription_price} ₽)`
                : t("channels.join")}
          </Button>
          {canManage && (
            <Button variant="outline" onClick={() => setSettingsOpen((v) => !v)}>
              {t("channels.settings")}
            </Button>
          )}
          {canManageMembers && (
            <Button
              variant="outline"
              onClick={() => {
                setMembersOpen((v) => !v);
                if (!members.length) {
                  api.getChannelMembers(slug).then(setMembers).catch(() => {});
                }
              }}
            >
              {t("channels.members")}
            </Button>
          )}
        </div>
      </div>

      {settingsOpen && canManage && (
        <Card className="mb-6">
          <CardContent className="pt-4 space-y-3 max-w-lg">
            <h2 className="font-medium">{t("channels.settings")}</h2>
            <div>
              <Label>{t("channels.name")}</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <Label>{t("profile.bio")}</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
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
            <div className="flex gap-2">
              <Button onClick={saveSettings} disabled={saving || !editTitle.trim()}>
                {t("channels.saveSettings")}
              </Button>
              <Button variant="ghost" onClick={() => setSettingsOpen(false)}>
                {t("profile.cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {membersOpen && canManageMembers && (
        <Card className="mb-6">
          <CardContent className="pt-4 space-y-3">
            <h2 className="font-medium">{t("channels.members")}</h2>
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
                <div className="flex flex-wrap gap-2">
                  {m.role !== "owner" && (
                    <>
                      {m.role !== "admin" ? (
                        <Button size="sm" variant="outline" onClick={() => setMemberRole(m.user_id, "admin")}>
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
                        <Button size="sm" variant="destructive" onClick={() => transferOwnership(m.user_id)}>
                          {t("channels.transferOwnership")}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("channels.membersEmpty")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {channel.is_owner && !channel.is_verified && (
        <Card className="mb-6">
          <CardContent className="pt-4 space-y-3 max-w-lg">
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
                <div>
                  <Label>{t("channels.verificationReason")}</Label>
                  <Textarea
                    value={verifyReason}
                    onChange={(e) => setVerifyReason(e.target.value)}
                    rows={3}
                    placeholder={t("channels.verificationReasonHint")}
                  />
                </div>
                <div>
                  <Label>{t("channels.verificationWebsite")}</Label>
                  <Input value={verifyWebsite} onChange={(e) => setVerifyWebsite(e.target.value)} />
                </div>
                <div>
                  <Label>{t("channels.verificationSocial")}</Label>
                  <Input value={verifySocial} onChange={(e) => setVerifySocial(e.target.value)} />
                </div>
                <Button onClick={submitVerification} disabled={verifyReason.trim().length < 20}>
                  {t("channels.submitVerification")}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {canPost && (
        <Card className="mb-6">
          <CardContent className="pt-4 space-y-3">
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={postType}
              onChange={(e) => setPostType(e.target.value)}
            >
              <option value="text">{t("channels.postText")}</option>
              <option value="poll">{t("channels.postPoll")}</option>
              <option value="event">{t("channels.postEvent")}</option>
            </select>
            <Textarea
              placeholder={t("channels.postPlaceholder")}
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
            />
            {postType === "poll" && (
              <Input
                placeholder={t("channels.pollOptionsHint")}
                value={pollOptions}
                onChange={(e) => setPollOptions(e.target.value)}
              />
            )}
            <Button type="button" onClick={publish}>
              {t("channels.publish")}
            </Button>
            {canManage && (
              <div className="border-t border-border pt-3">
                <Input
                  placeholder={t("channels.broadcastPlaceholder")}
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                />
                <Button type="button" variant="outline" className="mt-2" onClick={sendBroadcast}>
                  @all {t("channels.broadcast")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {posts.map((post) => (
          <Card key={post.id} className={post.is_pinned ? "border-primary" : ""}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <span>@{post.author_username}</span>
                {post.is_announcement && <span className="text-primary">📢</span>}
                {post.is_pinned && <span>📌</span>}
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
                    <img src={post.media_url} alt="" className="mt-2 rounded-lg max-h-64 object-cover" />
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
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
