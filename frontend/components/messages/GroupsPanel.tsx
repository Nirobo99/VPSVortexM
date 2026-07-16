"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api, type GroupInfo } from "@/lib/api";
import { Avatar, Button, Card, CardContent, Input, Label, Textarea } from "@/components/ui";

export function GroupsPanel() {
  const { t } = useTranslation();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [discover, setDiscover] = useState<GroupInfo[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPublic, setEditPublic] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api.getGroups().then(setGroups).catch(() => {});
    api.discoverGroups(search || undefined).then(setDiscover).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      api.discoverGroups(search || undefined).then(setDiscover).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const create = async () => {
    try {
      const memberList = members
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);
      const g = await api.createGroup(title, description, memberList, isPublic);
      if (avatarFile) {
        try {
          await api.uploadGroupAvatar(g.id, avatarFile);
        } catch {
          /* avatar can be set later */
        }
      }
      router.push(`/chats/${g.id}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const join = async (id: string) => {
    try {
      const g = await api.joinGroup(id);
      load();
      router.push(`/chats/${g.id}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const startEdit = (g: GroupInfo) => {
    setEditingId(g.id);
    setEditTitle(g.title || "");
    setEditDescription(g.description || "");
    setEditPublic(g.is_public !== false);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await api.updateGroup(editingId, {
        title: editTitle,
        description: editDescription,
        is_public: editPublic,
      });
      setEditingId(null);
      setMessage(t("groups.saved"));
      load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("auth.error"));
    }
  };

  const publicToJoin = discover.filter((g) => !g.is_member);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-lg font-semibold">{t("groups.title")}</h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {t("groups.create")}
        </Button>
      </div>

      {message && <p className="text-sm text-muted-foreground mb-3">{message}</p>}

      {showForm && (
        <Card className="mb-4">
          <CardContent className="pt-4 space-y-3 max-w-md">
            <div className="flex items-center gap-3">
              <Avatar src={avatarPreview} name={title || "G"} className="h-14 w-14" />
              <div>
                <input
                  ref={avatarRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setAvatarFile(file);
                    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                    setAvatarPreview(file ? URL.createObjectURL(file) : null);
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => avatarRef.current?.click()}>
                  {t("groups.changeAvatar")}
                </Button>
              </div>
            </div>
            <div>
              <Label>{t("groups.name")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>{t("profile.bio")}</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div>
              <Label>{t("groups.members")}</Label>
              <Input placeholder={t("groups.membersHint")} value={members} onChange={(e) => setMembers(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              {t("groups.public")}
            </label>
            <Button onClick={create} disabled={!title.trim()}>
              {t("groups.create")}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mb-6">
        <Label>{t("groups.search")}</Label>
        <Input
          className="mt-1 mb-3"
          placeholder={t("groups.searchHint")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="space-y-2">
          {publicToJoin.map((g) => (
            <Card key={`discover-${g.id}`}>
              <CardContent className="py-3 flex justify-between items-center gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{g.title}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {g.member_count}/{g.member_limit} · {g.description || t("groups.public")}
                  </p>
                </div>
                <Button size="sm" onClick={() => join(g.id)}>
                  {t("groups.join")}
                </Button>
              </CardContent>
            </Card>
          ))}
          {publicToJoin.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">{t("groups.discoverEmpty")}</p>
          )}
        </div>
      </div>

      <h3 className="text-sm font-medium text-muted-foreground mb-2">{t("groups.myGroups")}</h3>
      <div className="space-y-2">
        {groups.map((g) => (
          <Card key={g.id} className="hover:border-primary/50 transition-colors">
            <CardContent className="py-3 space-y-2">
              <div className="flex justify-between items-center gap-2">
                <Link href={`/chats/${g.id}`} className="min-w-0 flex-1 flex items-center gap-3">
                  <Avatar src={g.avatar_url} name={g.title || "G"} className="h-10 w-10 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{g.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {g.member_count}/{g.member_limit} {t("groups.membersCount")}
                      {g.is_public ? ` · ${t("groups.public")}` : ` · ${t("groups.private")}`}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  {g.is_paid_extended && <span className="text-xs text-primary">PRO</span>}
                  {(g.is_owner) && (
                    <Button size="sm" variant="outline" onClick={() => startEdit(g)}>
                      {t("groups.settings")}
                    </Button>
                  )}
                  {!g.is_member && g.is_public && (
                    <Button size="sm" onClick={() => join(g.id)}>
                      {t("groups.join")}
                    </Button>
                  )}
                  {!g.is_paid_extended && g.member_count >= g.member_limit - 50 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        api.extendGroup(g.id).then(load);
                      }}
                    >
                      {t("groups.extend")}
                    </Button>
                  )}
                </div>
              </div>
              {editingId === g.id && (
                <div className="space-y-2 border-t border-border pt-3">
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editPublic}
                      onChange={(e) => setEditPublic(e.target.checked)}
                    />
                    {t("groups.public")}
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit}>
                      {t("groups.save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      {t("profile.cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {groups.length === 0 && <p className="text-center text-muted-foreground py-8">{t("groups.empty")}</p>}
      </div>
    </div>
  );
}
