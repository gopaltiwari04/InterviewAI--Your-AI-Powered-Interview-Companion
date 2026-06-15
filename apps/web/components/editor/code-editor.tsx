"use client";

import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useSocket } from "@/components/providers/socket-provider";

interface CodeEditorProps {
  roomId: string;
  code: string;
  onCodeChange: (newCode: string) => void;
}

export function CodeEditor({ roomId, code, onCodeChange }: CodeEditorProps) {
  const { socket, isConnected } = useSocket();
  const isRemoteChange = useRef(false);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [language, setLanguage] = useState("javascript");

  useEffect(() => {
    if (!socket) return;

    socket.emit("join-room", roomId);

    socket.on("code-update", (newCode: string) => {
      isRemoteChange.current = true;
      onCodeChange(newCode);
    });

    socket.on("execution-result", (result: any) => {
      setIsRunning(false);
      setOutput(
        `Status: ${result.status}\nTime: ${result.executionTimeMs}ms\n\nOutput:\n${result.output}`
      );
    });

    socket.on("execution-queued", () => {
      setOutput("Running...");
    });

    return () => {
      socket.off("code-update");
      socket.off("execution-result");
      socket.off("execution-queued");
    };
  }, [socket, roomId, onCodeChange]);

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;

    onCodeChange(value);

    if (!isRemoteChange.current) {
      socket?.emit("code-change", { roomId, code: value });
    }

    isRemoteChange.current = false;
  };

  const handleRunCode = () => {
    if (!socket) return;

    setIsRunning(true);
    setOutput("Running...");

    socket.emit("run-code", {
      roomId,
      language,
      code,
    });
  };

  return (
    <div className="flex flex-col h-full w-full border rounded-lg overflow-hidden border-zinc-200 dark:border-zinc-800">
      <div className="bg-zinc-100 dark:bg-zinc-900 px-4 py-2 text-sm text-zinc-500 flex justify-between items-center">
        <span>main.js</span>

        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            {isConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Connected
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                Disconnected
              </>
            )}
          </span>

          <select
  value={language}
  onChange={(e) => setLanguage(e.target.value)}
  className="border rounded px-2 py-1 text-xs bg-white text-black"
>
  <option value="javascript">JavaScript</option>
  <option value="typescript">TypeScript</option>
  <option value="java">Java</option>
  <option value="cpp">C++</option>
  <option value="python">Python</option>
  <option value="c">C</option>
</select>

          <button
            onClick={handleRunCode}
            disabled={isRunning}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isRunning ? "Running..." : "Run Code"}
          </button>
        </div>
      </div>

      <div className="flex-1 h-[70%]">
        <Editor
          height="100%"
          language={language}
          theme="vs-dark"
          value={code}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: "on",
            padding: { top: 16 },
          }}
        />
      </div>

      <div className="h-40 border-t border-zinc-800 bg-black text-green-400 p-3 overflow-auto text-sm whitespace-pre-wrap">
        <pre>{output || "Execution output will appear here."}</pre>
      </div>
    </div>
  );
}