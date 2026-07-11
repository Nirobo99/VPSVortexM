"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api, type Gamification, type Profile, type Story } from "@/lib/api";
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

export default function ProfilePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading, reload } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [gamification, setGamification] = useState<Gamification | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const storyFileRef = useRef<HTMLInputElement>(null);
  const [storyText, setStoryText] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([api.getProfile(), api.getGamification(), api.getMyStories(), api.getQrSvg()])
      .then(([p, g, s, qr]) => {
        setProfile(p);
        setGamification(g);
        setStories(s);
        setQrSvg(qr);
      })
      .catch((e) => setMessage({ type: "err", text: e.message }));
  }, [user]);

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

  const addStory = async () => {
    const file = storyFileRef.current?.files?.[0];
    if (!storyText && !file) return;
    setSaving(true);
    try {
      const story = await api.createStory(storyText || null, file);
      setStories((prev) => [story, ...prev]);
      setStoryText("");
      if (storyFileRef.current) storyFileRef.current.value = "";
      setMessage({ type: "ok", text: t("profile.storyAdded") });
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

  if (loading || !user || !profile) {
    return (
      <AppShell>
        <div className="animate-pulse text-muted-foreground">...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold mb-6">{t("profile.title")}</h1>

      {message && (
        <Alert variant={message.type === "err" ? "destructive" : "default"} className="mb-4">
          {message.text}
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("profile.basicInfo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar src={profile.avatar_url} name={profile.display_name || profile.username} className="h-20 w-20 text-lg" />
              <div>
                <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={onAvatarChange} />
                <Button variant="outline" size="sm" onClick={() => avatarRef.current?.click()} disabled={saving}>
                  {t("profile.changeAvatar")}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">@{profile.username}</p>
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
              <Textarea id="bio" value={profile.bio || ""} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={3} />
            </div>
            <div>
              <Label htmlFor="birthDate">{t("profile.birthDate")}</Label>
              <Input
                id="birthDate"
                type="date"
                value={profile.birth_date?.slice(0, 10) || ""}
                onChange={(e) => setProfile({ ...profile, birth_date: e.target.value || null })}
              />
            </div>
            <div>
              <Label htmlFor="visibility">{t("profile.visibility")}</Label>
              <Select
                id="visibility"
                value={profile.profile_visibility}
                onChange={(e) => setProfile({ ...profile, profile_visibility: e.target.value })}
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

          {gamification && (
            <Card>
              <CardHeader>
                <CardTitle>{t("profile.gamification")}</CardTitle>
                <CardDescription>
                  {t("profile.level")} {gamification.level} · {gamification.activity_points} {t("profile.points")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-2 rounded-full bg-muted overflow-hidden mb-4">
                  <div className="h-full bg-primary transition-all" style={{ width: `${gamification.progress_percent}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {t("profile.nextLevel")}: {gamification.next_level_at} {t("profile.points")}
                </p>
                <div className="space-y-2">
                  {gamification.achievements.map((a) => (
                    <div
                      key={a.code}
                      className={`flex items-center gap-2 text-sm p-2 rounded-md ${a.earned ? "bg-primary/10" : "opacity-50"}`}
                    >
                      <span>{a.icon}</span>
                      <div>
                        <p className="font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{a.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("profile.stories")}</CardTitle>
          <CardDescription>{t("profile.storiesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder={t("profile.storyText")} value={storyText} onChange={(e) => setStoryText(e.target.value)} />
            <input ref={storyFileRef} type="file" accept="image/*,video/*" className="text-sm" />
            <Button onClick={addStory} disabled={saving}>
              {t("profile.addStory")}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stories.map((story) => (
              <div key={story.id} className="border border-border rounded-lg p-3 relative">
                {story.media_url && story.media_type === "image" && (
                  <img src={story.media_url} alt="" className="w-full h-32 object-cover rounded-md mb-2" />
                )}
                {story.media_url && story.media_type === "video" && (
                  <video src={story.media_url} className="w-full h-32 object-cover rounded-md mb-2" controls />
                )}
                {story.text && <p className="text-sm">{story.text}</p>}
                <p className="text-xs text-muted-foreground mt-1">
                  {t("profile.expires")}: {new Date(story.expires_at).toLocaleString()}
                </p>
                <Button variant="destructive" size="sm" className="mt-2" onClick={() => removeStory(story.id)}>
                  {t("profile.deleteStory")}
                </Button>
              </div>
            ))}
            {stories.length === 0 && <p className="text-sm text-muted-foreground">{t("profile.noStories")}</p>}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
