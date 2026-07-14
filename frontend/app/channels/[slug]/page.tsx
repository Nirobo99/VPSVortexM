"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api, type ChannelInfo, type ChannelPost } from "@/lib/api";
import { Button, Card, CardContent, Input, Textarea } from "@/components/ui";

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

  const load = () => {
    api.getChannel(slug).then(setChannel).catch(() => router.push("/channels"));
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
    if (channel.is_member) {
      await api.leaveChannel(slug);
    } else {
      await api.joinChannel(slug);
    }
    load();
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
    alert(t("channels.broadcastSent"));
  };

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
        <Link href="/channels" className="text-sm text-muted-foreground hover:text-foreground">← {t("channels.title")}</Link>
        <h1 className="text-2xl font-semibold mt-2 flex items-center gap-2">
          {channel.is_verified && <span className="text-primary">✓</span>}
          {channel.title}
        </h1>
        <p className="text-muted-foreground text-sm">@{channel.slug} · {channel.subscriber_count} {t("channels.subscribers")}</p>
        {channel.description && <p className="mt-2 text-sm">{channel.description}</p>}
        <Button className="mt-3" variant={channel.is_member ? "outline" : "default"} onClick={toggleJoin}>
          {channel.is_member ? t("channels.leave") : channel.subscription_price > 0 ? `${t("channels.join")} (${channel.subscription_price} ₽)` : t("channels.join")}
        </Button>
      </div>

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
            <Textarea placeholder={t("channels.postPlaceholder")} value={postText} onChange={(e) => setPostText(e.target.value)} />
            {postType === "poll" && (
              <Input placeholder={t("channels.pollOptionsHint")} value={pollOptions} onChange={(e) => setPollOptions(e.target.value)} />
            )}
            <Button onClick={publish}>{t("channels.publish")}</Button>
            <div className="border-t border-border pt-3">
              <Input placeholder={t("channels.broadcastPlaceholder")} value={broadcastText} onChange={(e) => setBroadcastText(e.target.value)} />
              <Button variant="outline" className="mt-2" onClick={sendBroadcast}>@all {t("channels.broadcast")}</Button>
            </div>
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
                  <span>🔒 {t("channels.lockedPost")} ({post.price})</span>
                  <Button size="sm" onClick={() => api.unlockPost(post.id).then(load)}>{t("channels.unlock")}</Button>
                </div>
              ) : (
                <>
                  {post.content && <p className="whitespace-pre-wrap">{post.content}</p>}
                  {post.media_url && <img src={post.media_url} alt="" className="mt-2 rounded-lg max-h-64 object-cover" />}
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
