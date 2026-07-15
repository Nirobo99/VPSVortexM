"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api, type Profile, type ProfilePost, type Story, type VerificationRequest } from "@/lib/api";
import { DisplayNameWithBadge } from "@/components/profile/DisplayNameWithBadge";
import { formatUserStatus, isAdminUser } from "@/lib/profileDisplay";
import { VerificationForm } from "@/components/profile/VerificationForm";
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

type ViewMode = "view" | "edit";
type PublishKind = "post" | "photo" | "story";

export default function ProfilePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading, reload } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [verification, setVerification] = useState<VerificationRequest | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("view");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishKind, setPublishKind] = useState<PublishKind>("post");
  const [publishText, setPublishText] = useState("");
  const avatarRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([api.getProfile(), api.getMyStories(), api.getMyPosts(), api.getMyVerificationRequest()])
      .then(([p, s, wall, v]) => {
        setProfile(p);
        setStories(s);
        setPosts(wall);
        setVerification(v);
      })
      .catch((e) => setMessage({ type: "err", text: e.message }));
  }, [user]);

  useEffect(() => {
    if (mode !== "edit" || qrSvg) return;
    api.getQrSvg().then(setQrSvg).catch(() => {});
  }, [mode, qrSvg]);

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
    if (publishKind === "post" && !publishText.trim() && !file) return;

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
                    admin={isAdminUser(profile)}
                    className="h-24 w-24 text-2xl mx-auto sm:mx-0"
                  />
                  <div className="flex-1 text-center sm:text-left min-w-0">
                    <h1 className="text-2xl font-semibold truncate">
                      <DisplayNameWithBadge name={displayName} verified={profile.is_official_verified} />
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
                        onClick={() => setPublishKind(kind)}
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

                  {(publishKind === "photo" || publishKind === "story") && (
                    <div>
                      <Label htmlFor="publishMedia">
                        {publishKind === "photo" ? t("profile.choosePhoto") : t("profile.chooseMedia")}
                      </Label>
                      <input
                        id="publishMedia"
                        ref={mediaRef}
                        type="file"
                        accept={publishKind === "photo" ? "image/*" : "image/*,video/*"}
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
                  <div key={post.id} className="border border-border rounded-lg p-3">
                    {post.media_url && (
                      <img
                        src={post.media_url}
                        alt=""
                        className="w-full max-h-80 object-cover rounded-md mb-2"
                      />
                    )}
                    {post.text && <p className="text-sm whitespace-pre-wrap">{post.text}</p>}
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-muted-foreground">
                        {new Date(post.created_at).toLocaleString()}
                      </p>
                      <Button variant="ghost" size="sm" onClick={() => removePost(post.id)}>
                        {t("profile.deletePost")}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
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
                      admin={isAdminUser(profile)}
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
          </>
        )}
      </div>
    </AppShell>
  );
}
