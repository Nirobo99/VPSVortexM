"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api, type GroupInfo } from "@/lib/api";
import { Button, Card, CardContent, Input, Label, Textarea } from "@/components/ui";

export default function GroupsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user) api.getGroups().then(setGroups).catch(() => {});
  }, [user]);

  const create = async () => {
    const memberList = members.split(",").map((m) => m.trim()).filter(Boolean);
    const g = await api.createGroup(title, description, memberList);
    router.push(`/chats/${g.id}`);
  };

  if (loading || !user) {
    return (
      <AppShell>
        <div className="animate-pulse">...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">{t("groups.title")}</h1>
        <Button onClick={() => setShowForm(!showForm)}>{t("groups.create")}</Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardContent className="pt-4 space-y-3 max-w-md">
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
            <Button onClick={create} disabled={!title.trim()}>{t("groups.create")}</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {groups.map((g) => (
          <Link key={g.id} href={`/chats/${g.id}`}>
            <Card className="hover:border-primary/50 transition-colors">
              <CardContent className="py-3 flex justify-between items-center">
                <div>
                  <p className="font-medium">👥 {g.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {g.member_count}/{g.member_limit} {t("groups.membersCount")}
                  </p>
                </div>
                {g.is_paid_extended && <span className="text-xs text-primary">PRO</span>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Link href="/channels" className="inline-block mt-6 text-sm text-muted-foreground hover:text-foreground">
        ← {t("channels.title")}
      </Link>
    </AppShell>
  );
}
