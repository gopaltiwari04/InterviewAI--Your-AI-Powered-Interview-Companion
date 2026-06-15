"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';

// Lightweight local replacement for @ai-sdk/react's useChat to avoid module resolution errors.
function useChat(opts: { api: string; body?: any }) {
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = input.trim();
      if (!trimmed) return;

      const userMessage = { id: String(Date.now()) + '-u', role: 'user' as const, content: trimmed };
      
      // 1. Capture the updated messages array so we can send the full history to the backend
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setInput('');
      setIsLoading(true);

      try {
        const res = await fetch(opts.api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // 2. CRITICAL FIX: Send the 'messages' array, not just a single 'message' string
          body: JSON.stringify({ ...opts.body, messages: updatedMessages }), 
        });
        
        // Handle standard text responses (since Vercel AI SDK toDataStreamResponse might send raw text chunks)
        const textResponse = await res.text();
        
        // Try to parse it as JSON just in case, otherwise treat it as a raw string
        let aiContent = textResponse;
        try {
            const data = JSON.parse(textResponse);
            aiContent = data.content || JSON.stringify(data);
        } catch {
            // It's just a raw text string, which is fine!
        }

        const aiMessage = { id: String(Date.now()) + '-a', role: 'assistant' as const, content: aiContent };
        setMessages((m) => [...m, aiMessage]);
      } catch (err) {
        const errMsg = { id: String(Date.now()) + '-e', role: 'assistant' as const, content: 'Error: failed to get response.' };
        setMessages((m) => [...m, errMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [input, messages, opts]
  );

  return { messages, input, handleInputChange, handleSubmit, isLoading };
}


// 3. CRITICAL FIX: Add roomId to your interface
interface AiChatProps {
  currentCode: string;
  roomId: string; 
}

// 4. CRITICAL FIX: Destructure roomId from props
export function AiChat({ currentCode, roomId }: AiChatProps) {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    body: {
      codeContext: currentCode, 
      roomId: roomId, // 5. CRITICAL FIX: Pass the roomId to the API!
    },
  });

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full border rounded-lg bg-white dark:bg-zinc-950 overflow-hidden">
      <div className="p-3 border-b bg-zinc-50 dark:bg-zinc-900 font-semibold text-sm">
        AI Interviewer
      </div>
      
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="text-zinc-500 text-sm text-center mt-10">
            Send a message to start the interview.
          </div>
        )}
        
        {messages.map((m: typeof messages[0]) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
              m.role === 'user' 
                ? 'bg-blue-600 text-white rounded-br-none' 
                : 'bg-zinc-100 dark:bg-zinc-800 rounded-bl-none'
            }`}>
              <strong className="block mb-1 text-xs opacity-70">
                {m.role === 'user' ? 'You' : 'AI'}
              </strong>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t bg-zinc-50 dark:bg-zinc-900 flex gap-2">
        <input
          className="flex-1 px-3 py-2 text-sm rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-950"
          value={input}
          placeholder="Explain your approach..."
          onChange={handleInputChange}
          disabled={isLoading}
        />
        <Button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}