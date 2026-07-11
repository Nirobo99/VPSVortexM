"use client";

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

interface HotkeysHelpProps {
  open: boolean;
  onClose: () => void;
}

export function HotkeysHelp({ open, onClose }: HotkeysHelpProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!open) return null;

  const shortcuts = [
    { keys: "?", desc: t("hotkeys.showHelp") },
    { keys: "Alt+1", desc: t("nav.dashboard") },
    { keys: "Alt+2", desc: t("nav.chats") },
    { keys: "Alt+3", desc: t("nav.channels") },
    { keys: "Alt+4", desc: t("nav.wallet") },
    { keys: "Alt+5", desc: t("nav.profile") },
    { keys: "Alt+6", desc: t("nav.settings") },
    ...(user && (user.role === "admin" || user.role === "superadmin")
      ? [{ keys: "Alt+7", desc: t("nav.admin") }]
      : []),
    { keys: "Ctrl+Enter", desc: t("hotkeys.sendMessage") },
    { keys: "Esc", desc: t("hotkeys.close") },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("hotkeys.title")}
    >
      <div
        className="bg-background border border-border rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">{t("hotkeys.title")}</h2>
        <ul className="space-y-2 mb-6">
          {shortcuts.map((s) => (
            <li key={s.keys} className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{s.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-muted font-mono text-xs shrink-0">{s.keys}</kbd>
            </li>
          ))}
        </ul>
        <Button className="w-full" onClick={onClose}>
          {t("hotkeys.close")}
        </Button>
      </div>
    </div>
  );
}
