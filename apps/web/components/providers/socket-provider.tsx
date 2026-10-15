"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { io as ClientIO, Socket } from "socket.io-client";

type SocketContextType = {
  socket: Socket | null;
  isConnected: boolean;
};

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // NEXT_PUBLIC_WS_URL is inlined at build time, so changing it on Vercel needs a redeploy.
    // Production example: https://interviewai-ws.onrender.com (https:// upgrades to wss://).
    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL ||
      (process.env.NODE_ENV === "development" ? "http://localhost:8080" : "");

    if (!wsUrl) {
      console.error("[Socket] NEXT_PUBLIC_WS_URL is not set; real-time features are disabled.");
      return;
    }

    const socketInstance = ClientIO(wsUrl, {
      withCredentials: true,
      transports: ["websocket"], // Force WebSockets over HTTP long-polling
    });

    socketInstance.on("connect", () => {
      setIsConnected(true);
    });

    socketInstance.on("disconnect", () => {
      setIsConnected(false);
    });

    socketInstance.on("connect_error", (err) => {
      console.warn(`[Socket] Connection to ${wsUrl} failed: ${err.message}`);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};