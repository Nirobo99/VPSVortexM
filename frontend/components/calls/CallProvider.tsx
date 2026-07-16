"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { api, type CallInfo } from "@/lib/api";
import { Button, Card, CardContent } from "@/components/ui";

interface IncomingCall {
  id: string;
  dialog_id: string;
  call_type: string;
  initiator_id: string;
  participants: { user_id: string; username: string; display_name: string | null }[];
}

const CallContext = createContext<{ startCall: (dialogId: string, type: "audio" | "video") => Promise<void> }>({
  startCall: async () => {},
});

export function useCallActions() {
  return useContext(CallContext);
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);

  const startCall = useCallback(
    async (dialogId: string, type: "audio" | "video") => {
      const call = await api.createCall(dialogId, type);
      router.push(`/call/${call.id}`);
    },
    [router]
  );

  useWebSocket((event) => {
    if (event.type === "call_incoming" && event.data && user) {
      if (user.notify_calls === false) return;
      const data = event.data as unknown as IncomingCall;
      if (data.initiator_id !== user.id) {
        const audioOk = user.calls_audio_enabled !== false;
        const videoOk = user.calls_video_enabled !== false;
        if (data.call_type === "video" && !videoOk) return;
        if (data.call_type !== "video" && !audioOk) return;
        setIncoming(data);
      }
    }
    if (event.type === "call_ended" || event.type === "call_declined") {
      setIncoming(null);
    }
  });

  const accept = async () => {
    if (!incoming) return;
    setIncoming(null);
    router.push(`/call/${incoming.id}`);
  };

  const decline = async () => {
    if (!incoming) return;
    await api.declineCall(incoming.id);
    setIncoming(null);
  };

  const caller = incoming?.participants.find((p) => p.user_id === incoming.initiator_id);

  return (
    <CallContext.Provider value={{ startCall }}>
      {children}
      {incoming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-sm animate-in fade-in">
            <CardContent className="pt-6 text-center space-y-4">
              <p className="text-lg font-semibold">
                {incoming.call_type === "video" ? "📹" : "📞"} {t("calls.incoming")}
              </p>
              <p className="text-muted-foreground">
                {caller?.display_name || caller?.username || "?"}
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="destructive" onClick={decline}>
                  {t("calls.decline")}
                </Button>
                <Button onClick={accept}>{t("calls.accept")}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </CallContext.Provider>
  );
}
