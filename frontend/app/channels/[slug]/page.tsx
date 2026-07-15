"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api, type ChannelInfo, type ChannelPost } from "@/lib/api";
import { Button, Card, CardContent, Input, Label, Textarea } from "@/components/ui";

export default function ChannelPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { user, loading } = useAuth();
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [postText, setPostText] = useState("");
  const [pollOptions, setPollOptions] = useState("");
  const [postType, setPostType] = useState("text");
  const [broadcastText, setBroadcastText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVisibility, setEditVisibility] = useState("public");
  const [editPrice, setEditPrice] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api
      .getChannel(slug)
      .then((ch) => {
        setChannel(ch);
        setEditTitle(ch.title);
        setEditDescription(ch.description || "");
        setEditVisibility(ch.visibility);
        setEditPrice(String(ch.subscription_price || 0));
      })
      .catch(() => router.push("/messages?tab=channels"));
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
      load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const publish = async () => {
    const form = new FormData();
    form.append("post_type", postType);
    if (postText) form.append("content", postText);
    if (postType === "poll" && pollOptions) form.append("poll_options", pollOptions.split("|").join("|"));
    await api.createChannelPost(slug, form);
    setPostText("");
    load();
  };

  const sendBroadcast = async () => {
    if (!broadcastText.trim()) return;
    await api.sendBroadcast(slug, broadcastText, true);
    setBroadcastText("");
    setMessage(t("channels.broadcastSent"));
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

  const canManage =
    !!channel && (channel.is_owner || (user && channel.owner_id === user.id));

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

      {channel.is_member && (
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
            <Button onClick={publish}>{t("channels.publish")}</Button>
            {canManage && (
              <div className="border-t border-border pt-3">
                <Input
                  placeholder={t("channels.broadcastPlaceholder")}
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                />
                <Button variant="outline" className="mt-2" onClick={sendBroadcast}>
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
                  <Button size="sm" onClick={() => api.unlockPost(post.id).then(load)}>
                    {t("channels.unlock")}
                  </Button>
                </div>
              ) : (
                <>
                  {post.content && <p className="whitespace-pre-wrap">{post.content}</p>}
                  {post.media_url && (
                    <img src={post.media_url} alt="" className="mt-2 rounded-lg max-h-64 object-cover" />
                  )}
                  {post.poll_options.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {post.poll_options.map((opt) => (
                        <button
                          key={opt.id}
                          className="block w-full text-left px-3 py-2 rounded-md border border-border hover:border-primary text-sm"
                          onClick={() => api.votePoll(post.id, opt.id).then(load)}
                        >
                          {opt.text} ({opt.votes_count})
                        </button>
                      ))}
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
