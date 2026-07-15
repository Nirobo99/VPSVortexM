"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  api,
  type PublicProfile,
  type ProfilePost,
  type ProfilePostComment,
  type Story,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { LanguageSwitcher } from "@/components/auth/AuthLayout";
import { Alert, Avatar, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import { LinkifiedText } from "@/components/ui/LinkifiedText";
import { DisplayNameWithBadge } from "@/components/profile/DisplayNameWithBadge";
import { formatUserStatus, isAdminUser } from "@/lib/profileDisplay";

export default function PublicProfilePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const username = decodeURIComponent(params.username as string);
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, ProfilePostComment[]>>({});
  const [draftByPost, setDraftByPost] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  const reportUser = async () => {
    if (!profile || !user) return;
    const reason = prompt(t("admin.reportReason"));
    if (!reason || reason.length < 5) return;
    setReporting(true);
    try {
      await api.submitComplaint("user", profile.id, reason);
      alert(t("admin.reportSent"));
    } catch (e) {
      alert(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setReporting(false);
    }
  };

  useEffect(() => {
    api
      .getPublicProfile(username)
      .then(async (p) => {
        setProfile(p);
        const [s, wall] = await Promise.all([
          api.getUserStories(username).catch(() => []),
          api.getUserPosts(username).catch(() => []),
        ]);
        setStories(s);
        setPosts(wall);
        const commentPairs = await Promise.all(
          wall.map(async (post) => {
            try {
              const comments = await api.getProfilePostComments(post.id);
              return [post.id, comments] as const;
            } catch {
              return [post.id, []] as const;
            }
          })
        );
        setCommentsByPost(Object.fromEntries(commentPairs));
      })
      .catch((e) => setError(e.message));
  }, [username]);

  const blockUser = async () => {
    if (!profile || !user) return;
    setBlocking(true);
    try {
      await api.blockUser(profile.id);
      setError(t("profile.userBlocked"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setBlocking(false);
    }
  };

  const openChat = async () => {
    if (!profile || !user) return;
    setOpeningChat(true);
    try {
      const dialog = await api.createDialog(profile.username);
      router.push(`/messages?dialog=${dialog.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.error"));
    } finally {
      setOpeningChat(false);
    }
  };

  const addComment = async (postId: string) => {
    const content = (draftByPost[postId] || "").trim();
    if (!content) return;
    try {
      const comment = await api.addProfilePostComment(postId, content);
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] || []), comment],
      }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p
        )
      );
      setDraftByPost((prev) => ({ ...prev, [postId]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const isOwn = user?.username === username;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <Link href={user ? "/dashboard" : "/"} className="text-xl font-bold text-primary">
          {t("app.name")}
        </Link>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {user ? (
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                {t("nav.dashboard")}
              </Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button size="sm">{t("nav.login")}</Button>
            </Link>
          )}
        </div>
      </header>

      <main className="p-6 max-w-lg mx-auto space-y-4">
        {error && !profile && <Alert variant="destructive">{error}</Alert>}
        {error && profile && <Alert variant="destructive">{error}</Alert>}

        {profile && (
          <>
            <Card>
              <CardHeader className="items-center text-center">
                <Avatar
                  src={profile.avatar_url}
                  name={profile.display_name || profile.username}
                  admin={isAdminUser(profile)}
                  className="h-24 w-24 text-2xl mx-auto mb-3"
                />
                <CardTitle className="flex items-center justify-center gap-2">
                  <DisplayNameWithBadge
                    name={profile.display_name || profile.username}
                    verified={profile.is_official_verified}
                  />
                </CardTitle>
                <p className="text-muted-foreground">
                  {formatUserStatus(profile.status_emoji, profile.status_text, t("profile.noStatus"))}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {profile.bio && <p className="text-sm text-center">{profile.bio}</p>}

                {stories.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">{t("profile.stories")}</h3>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {stories.map((story) => (
                        <div
                          key={story.id}
                          className="shrink-0 w-24 h-32 border border-primary rounded-lg overflow-hidden"
                        >
                          {story.media_url && story.media_type === "image" ? (
                            <img src={story.media_url} alt="" className="w-full h-full object-cover" />
                          ) : story.text ? (
                            <p className="text-xs p-2">{story.text}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {isOwn && (
                    <Link href="/profile">
                      <Button className="w-full">{t("profile.editProfile")}</Button>
                    </Link>
                  )}
                  {user && !isOwn && (
                    <>
                      <Button onClick={openChat} disabled={openingChat}>
                        {t("profile.openChat")}
                      </Button>
                      <Button variant="destructive" onClick={blockUser} disabled={blocking}>
                        {t("settings.block")}
                      </Button>
                      <Button variant="outline" onClick={reportUser} disabled={reporting}>
                        {t("admin.report")}
                      </Button>
                    </>
                  )}
                  {!user && (
                    <Link href="/login">
                      <Button className="w-full">{t("profile.loginToContact")}</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("profile.wall")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {posts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">{t("profile.noPosts")}</p>
                )}
                {posts.map((post) => (
                  <div key={post.id} className="border border-border rounded-lg p-3 space-y-2">
                    {post.media_url && (
                      <img
                        src={post.media_url}
                        alt=""
                        className="w-full max-h-72 object-cover rounded-md"
                      />
                    )}
                    {post.text && <LinkifiedText text={post.text} className="text-sm" />}
                    <p className="text-xs text-muted-foreground">
                      {new Date(post.created_at).toLocaleString()}
                      {typeof post.comments_count === "number"
                        ? ` · ${post.comments_count} ${t("profile.comments")}`
                        : ""}
                    </p>
                    <div className="space-y-2 border-t border-border pt-2">
                      {(commentsByPost[post.id] || []).map((c) => (
                        <div key={c.id} className="text-sm">
                          <span className="font-medium">@{c.author_username}</span>
                          <span className="text-muted-foreground">: </span>
                          <LinkifiedText text={c.content} />
                        </div>
                      ))}
                      {user && (
                        <div className="flex gap-2">
                          <Input
                            placeholder={t("profile.commentPlaceholder")}
                            value={draftByPost[post.id] || ""}
                            onChange={(e) =>
                              setDraftByPost((prev) => ({ ...prev, [post.id]: e.target.value }))
                            }
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => addComment(post.id)}
                            disabled={!(draftByPost[post.id] || "").trim()}
                          >
                            {t("profile.sendComment")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
