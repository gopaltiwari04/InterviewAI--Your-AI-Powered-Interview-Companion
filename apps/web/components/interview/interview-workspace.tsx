"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CodeEditor } from "@/components/editor/code-editor";
import { AiChat } from "@/components/interview/ai-chat";
import * as generateReportAction from "@/app/actions/generate-report";
import { Button } from "@/components/ui/button";
import { generateReport } from "@/app/actions/generate-report";

interface InterviewWorkspaceProps {
  roomId: string;
}

export function InterviewWorkspace({ roomId }: InterviewWorkspaceProps) {
  const [currentCode, setCurrentCode] = useState<string>("// Welcome...");
  const [isEnding, setIsEnding] = useState(false);
  const router = useRouter();

  const handleEndInterview = async () => {
    if (!confirm("Are you sure you want to end the interview?")) return;
    
    setIsEnding(true);
    try {
      const result = await generateReport(roomId);
      
      // Catch the empty state edge case safely
      if (result && 'error' in result) {
        alert(result.error);
        setIsEnding(false);
        return;
      }

      router.push(`/interview/${roomId}/report`);
    } catch (error) {
      console.error("Failed to generate report:", error);
      alert("There was an error generating your report. Please try again.");
      setIsEnding(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] w-full gap-4">
      
      {/* --- NEW HEADER BAR --- */}
      <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-3 rounded-lg">
        <div className="text-sm font-mono text-zinc-400">Room: {roomId}</div>
        <Button 
          variant="destructive" 
          onClick={handleEndInterview} 
          disabled={isEnding}
        >
          {isEnding ? "Generating Report..." : "End Interview"}
        </Button>
      </div>
      
      <div className="flex flex-1 w-full gap-4 overflow-hidden">
        <div className="w-1/3 flex flex-col gap-4 h-full">
          {/* ... existing AI Interviewer UI ... */}
          {/* cast props to any to satisfy differing AiChat prop types */}
          <AiChat {...({ currentCode, roomId } as any)} />
        </div>
        <div className="w-2/3 h-full">
          <CodeEditor roomId={roomId} code={currentCode} onCodeChange={setCurrentCode} />
        </div>
      </div>
      
    </div>
  );
}