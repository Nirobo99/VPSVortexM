"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

export type WsEvent = {
  type: string;
  data?: Record<string, unknown>;
  dialog_id?: string;
  user_id?: string;
  public_key?: string;
  emoji?: string;
};

type Handler = (event: WsEvent) => void;

let globalWs: WebSocket | null = null;
let handlers = new Set<Handler>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect() {
  if (globalWs?.readyState === WebSocket.OPEN) return;

  globalWs = new WebSocket(WS_URL);
  globalWs.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as WsEvent;
      handlers.forEach((h) => h(event));
    } catch {
      /* ignore */
    }
  };
  globalWs.onclose = () => {
    globalWs = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 3000);
  };
}

export function useWebSocket(onEvent: Handler) {
  const handlerRef = useRef(onEvent);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const wrapper: Handler = (e) => handlerRef.current(e);
    handlers.add(wrapper);
    connect();

    const interval = setInterval(() => {
      setConnected(globalWs?.readyState === WebSocket.OPEN);
      if (globalWs?.readyState === WebSocket.OPEN) {
        globalWs.send(JSON.stringify({ type: "ping" }));
      }
    }, 25000);

    return () => {
      handlers.delete(wrapper);
      clearInterval(interval);
    };
  }, []);

  const sendTyping = useCallback((dialogId: string) => {
    if (globalWs?.readyState === WebSocket.OPEN) {
      globalWs.send(JSON.stringify({ type: "typing", dialog_id: dialogId }));
    }
  }, []);

  return { connected, sendTyping };
}
