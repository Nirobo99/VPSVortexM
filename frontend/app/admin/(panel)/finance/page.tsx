"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@/lib/adminApi";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, CardContent, Input } from "@/components/ui";

export default function AdminFinancePage() {
  const { t } = useTranslation();
  const { can } = useAdminAuth();
  const [txs, setTxs] = useState<Record<string, unknown>[]>([]);
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const load = () => adminApi.finance(userId || undefined).then((r) => setTxs(r.transactions));
  useEffect(() => { load(); }, []);

  const adjust = async () => {
    if (!userId || !amount || !reason) return;
    await adminApi.adjustWallet(userId, Number(amount), reason);
    setAmount("");
    setReason("");
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("adminPanel.finance")}</h1>
      {can("finance", "adjust") && (
        <Card className="mb-6">
          <CardContent className="pt-4 space-y-3">
            <Input placeholder="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} />
            <Input type="number" placeholder={t("adminPanel.amount")} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input placeholder={t("adminPanel.reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button onClick={adjust}>{t("adminPanel.adjust")}</Button>
          </CardContent>
        </Card>
      )}
      <div className="flex gap-2 mb-4">
        <Input placeholder="User ID filter" value={userId} onChange={(e) => setUserId(e.target.value)} className="max-w-xs" />
        <Button variant="outline" onClick={load}>{t("chats.search")}</Button>
      </div>
      <div className="space-y-2">
        {txs.map((tx) => (
          <Card key={String(tx.id)}>
            <CardContent className="py-3 flex justify-between text-sm">
              <span>{String(tx.type)} · {String(tx.user_id)}</span>
              <span className={Number(tx.amount) >= 0 ? "text-green-600" : "text-destructive"}>{String(tx.amount)} ₽</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
