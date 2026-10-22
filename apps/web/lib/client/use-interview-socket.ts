"use client";

import type { InterviewBroadcast } from "@repo/core/realtime";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { api } from "./api";

export interface Presence {
  userId: string;
  name: string;
  role: string;
}

export interface CodeSync {
  questionId: string;
  code: string;
  language: string;
  seq: number;
}

interface Handlers {
  onInterviewEvent: (event: InterviewBroadcast) => void;
  onSubmissionUpdate: (submissionId: string) => void;
  onCodeSync?: (sync: CodeSync) => void;
  onReconnect: () => void;
}

export type ConnectionState = "disabled" | "connecting" | "connected" | "reconnecting" | "offline";

export interface InterviewSocket {
  state: ConnectionState;
  presence: Presence[];
  clockOffsetMs: number;
  sendCode: (sync: CodeSync) => void;
}

/**
 * Socket.IO connection for one interview room. Authenticates with a
 * short-lived token from the web API (fetched again on every reconnect) and
 * calls onReconnect so the page can refetch authoritative state from the API.
 * The app keeps working without it: the room page also polls.
 */
export function useInterviewSocket(roomId: string, enabled: boolean, handlers: Handlers): InterviewSocket {
  const [state, setState] = useState<ConnectionState>(enabled ? "connecting" : "disabled");
  const [presence, setPresence] = useState<Presence[]>([]);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_WS_URL || (process.env.NODE_ENV === "development" ? "http://localhost:8080" : "");
    if (!enabled || !url) {
      setState("disabled");
      return;
    }
    let disposed = false;
    let everConnected = false;
    const socket = io(url, {
      transports: ["websocket"],
      autoConnect: false,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      // A fresh token for every (re)connection attempt.
      auth: (cb) => {
        api<{ token: string }>(`/api/interviews/${roomId}/realtime-token`, { method: "POST", body: {} })
          .then((r) => cb({ token: r.token }))
          .catch(() => cb({ token: "" }));
      },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setState("connected");
      if (everConnected) handlersRef.current.onReconnect();
      everConnected = true;
    });
    socket.on("disconnect", () => !disposed && setState("reconnecting"));
    socket.on("connect_error", () => !disposed && setState(everConnected ? "reconnecting" : "offline"));
    socket.on("hello", (msg: { serverTime: string; presence: Presence[] }) => {
      setClockOffsetMs(new Date(msg.serverTime).getTime() - Date.now());
      setPresence(msg.presence);
    });
    socket.on("presence", (list: Presence[]) => setPresence(list));
    socket.on("interview-event", (event: InterviewBroadcast) => handlersRef.current.onInterviewEvent(event));
    socket.on("submission-event", (msg: { submissionId: string }) => handlersRef.current.onSubmissionUpdate(msg.submissionId));
    socket.on("code-sync", (msg: CodeSync) => handlersRef.current.onCodeSync?.(msg));
    socket.connect();

    return () => {
      disposed = true;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, enabled]);

  const sendCode = (sync: CodeSync) => {
    if (socketRef.current?.connected) socketRef.current.emit("code-sync", sync);
  };
  return { state, presence, clockOffsetMs, sendCode };
}
