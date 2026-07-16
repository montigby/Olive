import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { getGetPersonQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type ActionConfirmation =
  | { type: "added"; name: string }
  | { type: "updated"; name: string }
  | { type: "event"; name: string; eventType: string }
  | { type: "deleted"; name: string };

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content:
    "Hi! I'm Olive 🌿 Tell me about your family in your own words — add someone new, update a birthday or contact info, or log a life event like a graduation or new job.",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  graduation: "graduation",
  marriage: "marriage",
  new_baby: "new baby",
  moved: "move",
  new_job: "new job",
  death: "passing",
  custom: "life event",
};

export function AiChatWidget() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastAction, setLastAction] = useState<ActionConfirmation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;
  const unitId = user.familyUnit.id;

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: text.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setLastAction(null);

    try {
      const token = localStorage.getItem("oliveToken");
      const resp = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: nextMessages,
          unitId,
        }),
      });

      if (!resp.ok) {
        throw new Error("Request failed");
      }

      const data = await resp.json() as {
        reply: string;
        memberAdded?: { id: string; firstName: string; lastName: string } | null;
        memberUpdated?: { id: string; firstName: string; lastName: string } | null;
        lifeEventAdded?: { personName: string; eventType: string } | null;
        memberDeleted?: { name: string } | null;
      };

      const assistantMessage: Message = {
        role: "assistant",
        content: data.reply || "Done!",
      };
      setMessages((prev) => [...prev, assistantMessage]);

      if (data.memberAdded || data.memberUpdated || data.lifeEventAdded || data.memberDeleted) {
        queryClient.invalidateQueries({ queryKey: [`/api/family-units/${user?.familyUnit.id}/members`] });
        queryClient.invalidateQueries({ queryKey: [`/api/family-units/${user?.familyUnit.id}/home-feed`] });
      }

      if (data.memberAdded) {
        setLastAction({ type: "added", name: `${data.memberAdded.firstName} ${data.memberAdded.lastName}` });
        queryClient.invalidateQueries({ queryKey: getGetPersonQueryKey(data.memberAdded.id) });
      } else if (data.memberUpdated) {
        setLastAction({ type: "updated", name: `${data.memberUpdated.firstName} ${data.memberUpdated.lastName}` });
        queryClient.invalidateQueries({ queryKey: getGetPersonQueryKey(data.memberUpdated.id) });
      } else if (data.memberDeleted) {
        setLastAction({ type: "deleted", name: data.memberDeleted.name });
      } else if (data.lifeEventAdded) {
        setLastAction({
          type: "event",
          name: data.lifeEventAdded.personName,
          eventType: data.lifeEventAdded.eventType,
        });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleReset() {
    setMessages([WELCOME_MESSAGE]);
    setLastAction(null);
    setInput("");
  }

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-28 right-6 z-50 md:bottom-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center cursor-pointer print:hidden"
          aria-label="Open AI assistant"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-80 sm:w-96 flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden print:hidden"
          style={{ maxHeight: "min(560px, calc(100vh - 100px))" }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-primary text-primary-foreground flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm leading-tight">Olive AI</p>
              <p className="text-[11px] opacity-75">Add, update, or log family news</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="w-9 h-9 rounded-full hover:bg-primary-foreground/20 flex items-center justify-center transition-colors cursor-pointer"
                title="Start over"
              >
                <MessageCircle className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-9 h-9 rounded-full hover:bg-primary-foreground/20 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-background">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2 items-end",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row",
                )}
              >
                {msg.role === "assistant" && (
                  <Avatar className="w-7 h-7 flex-shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                      AI
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-secondary text-foreground rounded-bl-sm",
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2 items-end">
                <Avatar className="w-7 h-7 flex-shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                    AI
                  </AvatarFallback>
                </Avatar>
                <div className="bg-secondary rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:0ms]" />
                  <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:150ms]" />
                  <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}

            {lastAction && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
                <span className="text-emerald-500">✓</span>
                {lastAction.type === "added" && (
                  <span><strong>{lastAction.name}</strong> added to your family tree</span>
                )}
                {lastAction.type === "updated" && (
                  <span><strong>{lastAction.name}</strong>'s profile updated</span>
                )}
                {lastAction.type === "event" && (
                  <span>
                    Logged a {EVENT_TYPE_LABELS[lastAction.eventType] ?? "life event"} for{" "}
                    <strong>{lastAction.name}</strong>
                  </span>
                )}
                {lastAction.type === "deleted" && (
                  <span><strong>{lastAction.name}</strong> removed from your family tree</span>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-3 border-t bg-card flex-shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell me anything about your family…"
              disabled={isLoading}
              className="flex-1 text-sm bg-secondary rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all flex-shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
