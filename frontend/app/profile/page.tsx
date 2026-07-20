"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import {
  api,
  type BlockedUser,
  type Profile,
  type ProfilePost,
  type ProfilePostComment,
  type Story,
  type VerificationRequest,
} from "@/lib/api";
import { DisplayNameWithBadge } from "@/components/profile/DisplayNameWithBadge";
import { formatUserStatus } from "@/lib/profileDisplay";
import { VerificationForm } from "@/components/profile/VerificationForm";
import { ReferralSection } from "@/components/referral/ReferralSection";
import { sanitizeSvg } from "@/lib/sanitize";
import {
  Alert,
  Avatar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import { LinkifiedText } from "@/components/ui/LinkifiedText";

type ViewMode = "view" | "edit";
type PublishKind = "post" | "photo" | "story";

export default function ProfilePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading, reload } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, ProfilePostComment[]>>({});
  const [draftByPost, setDraftByPost] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [verification, setVerification] = useState<VerificationRequest | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("view");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishKind, setPublishKind] = useState<PublishKind>("post");
  const [publishText, setPublishText] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [invisibleTime, setInvisibleTime] = useState("");
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [blockUsername, setBlockUsername] = useState("");
  const avatarRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.getProfile(),
      api.getMyStories().catch(() => []),
      api.getMyPosts(),
      api.getMyVerificationRequest().catch(() => null),
    ])
      .then(([p, s, wall, v]) => {
        setProfile(p);
        setStories(s);
        setPosts(wall);
        setVerification(v);
        setNewUsername(p.username);
        if (p.invisible_fake_last_seen) {
          setInvisibleTime(p.invisible_fake_last_seen.slice(0, 16));
        }
      })
      .catch((e) => setMessage({ type: "err", text: e.message }));
  }, [user]);

  useEffect(() => {
    if (mode !== "edit" || qrSvg) return;
    api.getQrSvg().then(setQrSvg).catch(() => {});
  }, [mode, qrSvg]);

  useEffect(() => {
    if (mode !== "edit") return;
    api.getBlocks().then(setBlocks).catch(() => {});
  }, [mode]);

  useEffect(() => {
    if (!shareOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [shareOpen]);

  const profileUrl =
    typeof window !== "undefined" && profile
      ? `${window.location.origin}/users/${encodeURIComponent(profile.username)}`
      : "";

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateProfile({
        display_name: profile.display_name || undefined,
        bio: profile.bio || undefined,
        birth_date: profile.birth_date || null,
        profile_visibility: profile.profile_visibility,
      });
      setProfile(updated);
      await reload();
      setMessage({ type: "ok", text: t("profile.saved") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    if (!currentPassword || !newPassword) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setMessage({ type: "ok", text: t("settings.passwordChanged") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const saveUsername = async () => {
    if (!newUsername.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.changeUsername(newUsername.trim());
      const updated = await api.getProfile();
      setProfile(updated);
      setNewUsername(updated.username);
      await reload();
      setMessage({ type: "ok", text: t("settings.usernameChanged") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const saveInvisibleTime = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.updateInvisibleSettings(invisibleTime ? new Date(invisibleTime).toISOString() : null);
      const updated = await api.getProfile();
      setProfile(updated);
      setMessage({ type: "ok", text: t("settings.invisibleSaved") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const blockByUsername = async () => {
    if (!blockUsername.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const publicProfile = await api.getPublicProfile(blockUsername.trim());
      await api.blockUser(publicProfile.id);
      setBlocks(await api.getBlocks());
      setBlockUsername("");
      setMessage({ type: "ok", text: t("settings.userBlocked") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const unblock = async (id: string) => {
    try {
      await api.unblockUser(id);
      setBlocks((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    }
  };

  const saveStatus = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await api.updateStatus(profile.status_text, profile.status_emoji);
      setProfile(updated);
      setMessage({ type: "ok", text: t("profile.statusSaved") });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const updated = await api.uploadAvatar(file);
      setProfile(updated);
      await reload();
      setMessage({ type: "ok", text: t("profile.avatarUpdated") });
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    const file = mediaRef.current?.files?.[0];
    if (publishKind === "story") {
      if (!publishText && !file) return;
      setSaving(true);
      try {
        const story = await api.createStory(publishText || null, file);
        setStories((prev) => [story, ...prev]);
        setPublishText("");
        if (mediaRef.current) mediaRef.current.value = "";
        setPublishOpen(false);
        setMessage({ type: "ok", text: t("profile.storyAdded") });
      } catch (e) {
        setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (publishKind === "photo" && !file) {
      setMessage({ type: "err", text: t("profile.photoRequired") });
      return;
    }
    if (publishKind === "post" && !publishText.trim() && !file) {
      setMessage({ type: "err", text: t("profile.emptyPost") });
      return;
    }

    setSaving(true);
    try {
      const post = await api.createProfilePost(publishText || null, file);
      setPosts((prev) => [post, ...prev]);
      setPublishText("");
      if (mediaRef.current) mediaRef.current.value = "";
      setPublishOpen(false);
      setMessage({
        type: "ok",
        text: publishKind === "photo" ? t("profile.photoAdded") : t("profile.postAdded"),
      });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    } finally {
      setSaving(false);
    }
  };

  const removeStory = async (id: string) => {
    try {
      await api.deleteStory(id);
      setStories((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    }
  };

  const removePost = async (id: string) => {
    try {
      await api.deleteProfilePost(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : t("auth.error") });
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setMessage({ type: "ok", text: t("profile.linkCopied") });
      setShareOpen(false);
    } catch {
      setMessage({ type: "err", text: t("auth.error") });
    }
  };

  const shareEmail = () => {
    const subject = encodeURIComponent(t("profile.shareEmailSubject"));
    const body = encodeURIComponent(
      t("profile.shareEmailBody", {
        name: profile?.display_name || profile?.username || "",
        url: profileUrl,
      })
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setShareOpen(false);
  };

  if (loading || !user || !profile) {
    return (
      <AppShell>
        <div className="animate-pulse text-muted-foreground">...</div>
      </AppShell>
    );
  }

  const displayName = profile.display_name || profile.username;
  const statusLine = formatUserStatus(profile.status_emoji, profile.status_text, t("profile.noStatus"));

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        {message && (
          <Alert variant={message.type === "err" ? "destructive" : "default"} className="mb-4">
            {message.text}
          </Alert>
        )}

        {mode === "view" ? (
          <>
            <Card className="mb-6 overflow-visible">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                  <Avatar
                    src={profile.avatar_url}
                    name={displayName}
                    className="h-24 w-24 text-2xl mx-auto sm:mx-0"
                  />
                  <div className="flex-1 text-center sm:text-left min-w-0">
                    <h1 className="text-2xl font-semibold truncate">
                      <DisplayNameWithBadge
                        name={displayName}
                        verified={profile.is_official_verified}
                        highlighted={profile.display_name_highlighted}
                      />
                    </h1>
                    <p className="text-muted-foreground mt-1">{statusLine}</p>
                    {profile.bio && <p className="text-sm mt-3 whitespace-pre-wrap">{profile.bio}</p>}

                    <div className="mt-5 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <Button variant="outline" onClick={() => setMode("edit")}>
                        {t("profile.editInfo")}
                      </Button>

                      <div className="relative" ref={shareRef}>
                        <Button variant="outline" onClick={() => setShareOpen((v) => !v)}>
                          {t("profile.share")}
                        </Button>
                        {shareOpen && (
                          <div className="absolute left-0 sm:left-auto top-full mt-2 z-20 min-w-[220px] rounded-lg border border-border bg-card shadow-lg p-1">
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted"
                              onClick={shareEmail}
                            >
                              {t("profile.shareEmail")}
                            </button>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted"
                              onClick={copyLink}
                            >
                              {t("profile.copyLink")}
                            </button>
                          </div>
                        )}
                      </div>

                      <Button
                        onClick={() => {
                          setPublishOpen((v) => !v);
                          setPublishKind("post");
                        }}
                      >
                        {t("profile.publish")}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {publishOpen && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg">{t("profile.publish")}</CardTitle>
                  <CardDescription>{t("profile.publishHint")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["post", t("profile.publishPost")],
                        ["photo", t("profile.publishPhoto")],
                        ["story", t("profile.publishStory")],
                      ] as const
                    ).map(([kind, label]) => (
                      <Button
                        key={kind}
                        type="button"
                        size="sm"
                        variant={publishKind === kind ? "default" : "outline"}
                        onClick={() => {
                          setPublishKind(kind);
                          setPublishText("");
                          if (mediaRef.current) mediaRef.current.value = "";
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>

                  {(publishKind === "post" || publishKind === "story") && (
                    <Textarea
                      placeholder={
                        publishKind === "story" ? t("profile.storyText") : t("profile.postText")
                      }
                      value={publishText}
                      onChange={(e) => setPublishText(e.target.value)}
                      rows={3}
                    />
                  )}

                  {(publishKind === "post" || publishKind === "photo" || publishKind === "story") && (
                    <div>
                      <Label htmlFor="publishMedia">
                        {publishKind === "story"
                          ? t("profile.chooseMedia")
                          : publishKind === "photo"
                            ? t("profile.choosePhoto")
                            : t("profile.choosePostPhoto")}
                      </Label>
                      <input
                        id="publishMedia"
                        ref={mediaRef}
                        type="file"
                        accept={publishKind === "story" ? "image/*,video/*" : "image/*"}
                        className="mt-1 block w-full text-sm"
                      />
                    </div>
                  )}

                  {publishKind === "photo" && (
                    <Textarea
                      placeholder={t("profile.photoCaption")}
                      value={publishText}
                      onChange={(e) => setPublishText(e.target.value)}
                      rows={2}
                    />
                  )}

                  <div className="flex gap-2">
                    <Button onClick={publish} disabled={saving}>
                      {t("profile.publishAction")}
                    </Button>
                    <Button variant="ghost" onClick={() => setPublishOpen(false)}>
                      {t("profile.cancel")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {stories.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg">{t("profile.stories")}</CardTitle>
                  <CardDescription>{t("profile.storiesHint")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {stories.map((story) => (
                      <div
                        key={story.id}
                        className="shrink-0 w-28 border border-border rounded-lg overflow-hidden bg-muted/30"
                      >
                        {story.media_url && story.media_type === "image" && (
                          <img src={story.media_url} alt="" className="w-full h-36 object-cover" />
                        )}
                        {story.media_url && story.media_type === "video" && (
                          <video src={story.media_url} className="w-full h-36 object-cover" controls />
                        )}
                        {story.text && <p className="text-xs p-2 line-clamp-3">{story.text}</p>}
                        <div className="p-2 pt-1">
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(story.expires_at).toLocaleString()}
                          </p>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="mt-1 w-full h-7 text-xs"
                            onClick={() => removeStory(story.id)}
                          >
                            {t("profile.deleteStory")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("profile.wall")}</CardTitle>
                <CardDescription>{t("profile.wallHint")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {posts.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("profile.noPosts")}</p>
                )}
                {posts.map((post) => (
                  <div key={post.id} className="border border-border rounded-lg p-3 space-y-2">
                    {post.media_url && (
                      <img
                        src={post.media_url}
                        alt=""
                        className="w-full max-h-80 object-cover rounded-md"
                      />
                    )}
                    {post.text && <LinkifiedText text={post.text} className="text-sm" />}
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {new Date(post.created_at).toLocaleString()}
                        {typeof post.comments_count === "number"
                          ? ` · ${post.comments_count} ${t("profile.comments")}`
                          : ""}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={async () => {
                            const open = !expandedComments[post.id];
                            setExpandedComments((prev) => ({ ...prev, [post.id]: open }));
                            if (open && !commentsByPost[post.id]) {
                              try {
                                const comments = await api.getProfilePostComments(post.id);
                                setCommentsByPost((prev) => ({ ...prev, [post.id]: comments }));
                              } catch {
                                setCommentsByPost((prev) => ({ ...prev, [post.id]: [] }));
                              }
                            }
                          }}
                        >
                          {t("profile.comments")}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => removePost(post.id)}>
                          {t("profile.deletePost")}
                        </Button>
                      </div>
                    </div>
                    {expandedComments[post.id] && (
                      <div className="space-y-2 border-t border-border pt-2">
                        {(commentsByPost[post.id] || []).map((c) => (
                          <div key={c.id} className="text-sm">
                            <span className="font-medium">@{c.author_username}</span>
                            <span className="text-muted-foreground">: </span>
                            <LinkifiedText text={c.content} />
                          </div>
                        ))}
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
                            disabled={!(draftByPost[post.id] || "").trim()}
                            onClick={async () => {
                              const content = (draftByPost[post.id] || "").trim();
                              if (!content) return;
                              try {
                                const comment = await api.addProfilePostComment(post.id, content);
                                setCommentsByPost((prev) => ({
                                  ...prev,
                                  [post.id]: [...(prev[post.id] || []), comment],
                                }));
                                setPosts((prev) =>
                                  prev.map((p) =>
                                    p.id === post.id
                                      ? { ...p, comments_count: (p.comments_count || 0) + 1 }
                                      : p
                                  )
                                );
                                setDraftByPost((prev) => ({ ...prev, [post.id]: "" }));
                              } catch (e) {
                                setMessage({
                                  type: "err",
                                  text: e instanceof Error ? e.message : t("auth.error"),
                                });
                              }
                            }}
                          >
                            {t("profile.sendComment")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <ReferralSection />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6 gap-3">
              <h1 className="text-2xl font-semibold">{t("profile.editInfo")}</h1>
              <Button variant="outline" onClick={() => setMode("view")}>
                {t("profile.backToProfile")}
              </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>{t("profile.basicInfo")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar
                      src={profile.avatar_url}
                      name={displayName}
                      className="h-20 w-20 text-lg"
                    />
                    <div>
                      <input
                        ref={avatarRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={onAvatarChange}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => avatarRef.current?.click()}
                        disabled={saving}
                      >
                        {t("profile.changeAvatar")}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="displayName">{t("profile.displayName")}</Label>
                    <Input
                      id="displayName"
                      value={profile.display_name || ""}
                      onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bio">{t("profile.bio")}</Label>
                    <Textarea
                      id="bio"
                      value={profile.bio || ""}
                      onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="birthDate">{t("profile.birthDate")}</Label>
                    <Input
                      id="birthDate"
                      type="date"
                      value={profile.birth_date?.slice(0, 10) || ""}
                      onChange={(e) =>
                        setProfile({ ...profile, birth_date: e.target.value || null })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="visibility">{t("profile.visibility")}</Label>
                    <Select
                      id="visibility"
                      value={profile.profile_visibility}
                      onChange={(e) =>
                        setProfile({ ...profile, profile_visibility: e.target.value })
                      }
                    >
                      <option value="public">{t("profile.public")}</option>
                      <option value="private">{t("profile.private")}</option>
                    </Select>
                  </div>
                  <Button onClick={saveProfile} disabled={saving}>
                    {t("profile.save")}
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("profile.status")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder={t("profile.statusEmoji")}
                        value={profile.status_emoji || ""}
                        onChange={(e) => setProfile({ ...profile, status_emoji: e.target.value })}
                        className="w-16"
                        maxLength={4}
                      />
                      <Input
                        placeholder={t("profile.statusText")}
                        value={profile.status_text || ""}
                        onChange={(e) => setProfile({ ...profile, status_text: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                    <Button variant="outline" size="sm" onClick={saveStatus} disabled={saving}>
                      {t("profile.updateStatus")}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t("profile.qrCode")}</CardTitle>
                    <CardDescription>{t("profile.qrHint")}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex justify-center">
                    {qrSvg && (
                      <div
                        className="bg-white p-2 rounded-lg"
                        dangerouslySetInnerHTML={{ __html: sanitizeSvg(qrSvg) }}
                      />
                    )}
                  </CardContent>
                </Card>

                <VerificationForm
                  existing={verification}
                  isVerified={profile.is_official_verified}
                  onSubmitted={(req) => {
                    setVerification(req);
                    setMessage({ type: "ok", text: t("verification.submitted") });
                  }}
                />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.password")}</CardTitle>
                  <CardDescription>{t("settings.passwordHint")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    type="password"
                    placeholder={t("settings.currentPassword")}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <Input
                    type="password"
                    placeholder={t("settings.newPassword")}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <Button onClick={savePassword} disabled={saving || !currentPassword || !newPassword}>
                    {t("settings.savePassword")}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.username")}</CardTitle>
                  <CardDescription>{t("settings.usernameHint")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                  <Button
                    onClick={saveUsername}
                    disabled={saving || !newUsername.trim() || newUsername.trim() === profile.username}
                  >
                    {t("settings.saveUsername")}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("wallet.invisibleTitle")}</CardTitle>
                  <CardDescription>{t("wallet.invisibleHint")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>{t("wallet.invisibleFakeTime")}</Label>
                    <Input
                      type="datetime-local"
                      value={invisibleTime}
                      onChange={(e) => setInvisibleTime(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" onClick={saveInvisibleTime} disabled={saving}>
                    {t("settings.saveInvisible")}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.blocklist")}</CardTitle>
                  <CardDescription>{t("settings.blocklistHint")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder={t("settings.blockUsername")}
                      value={blockUsername}
                      onChange={(e) => setBlockUsername(e.target.value)}
                    />
                    <Button onClick={blockByUsername} disabled={saving || !blockUsername.trim()}>
                      {t("settings.block")}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {blocks.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between p-2 border border-border rounded-md"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar
                            src={b.avatar_url}
                            name={b.display_name || b.username}
                            className="h-8 w-8 text-xs shrink-0"
                          />
                          <span className="text-sm truncate">@{b.username}</span>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => unblock(b.id)}>
                          {t("settings.unblock")}
                        </Button>
                      </div>
                    ))}
                    {blocks.length === 0 && (
                      <p className="text-sm text-muted-foreground">{t("settings.noBlocks")}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <ReferralSection />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
