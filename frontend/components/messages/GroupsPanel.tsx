"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api, type GroupInfo } from "@/lib/api";
import { Button, Card, CardContent, Input, Label, Textarea } from "@/components/ui";

export function GroupsPanel() {
  const { t } = useTranslation();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = () => api.getGroups().then(setGroups).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    const memberList = members
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    const g = await api.createGroup(title, description, memberList);
    router.push(`/chats/${g.id}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-lg font-semibold">{t("groups.title")}</h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {t("groups.create")}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-4">
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
            <Button onClick={create} disabled={!title.trim()}>
              {t("groups.create")}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {groups.map((g) => (
          <Link key={g.id} href={`/chats/${g.id}`}>
            <Card className="hover:border-primary/50 transition-colors">
              <CardContent className="py-3 flex justify-between items-center gap-2">
                <div>
                  <p className="font-medium">{g.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {g.member_count}/{g.member_limit} {t("groups.membersCount")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {g.is_paid_extended && <span className="text-xs text-primary">PRO</span>}
                  {!g.is_paid_extended && g.member_count >= g.member_limit - 50 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.preventDefault();
                        api.extendGroup(g.id).then(load);
                      }}
                    >
                      {t("groups.extend")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {groups.length === 0 && <p className="text-center text-muted-foreground py-8">{t("groups.empty")}</p>}
      </div>
    </div>
  );
}
