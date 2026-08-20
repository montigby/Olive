import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BookUser, AlertCircle, CheckCircle2 } from "lucide-react";

// Public, no-login page reached from the "Unsubscribe with one click" link in
// every memory-prompt email. Auto-fires on mount, same pattern as
// verify-email.tsx -- the click on the email link IS the one click the spec
// asked for, this page just confirms it happened rather than asking for a
// second confirmation click.
type Status = "idle" | "loading" | "success" | "error";

export default function MemoryPromptsUnsubscribe() {
  const [status, setStatus] = useState<Status>("idle");
  const [personName, setPersonName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const attempted = useRef(false);

  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token"),
    [],
  );

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    setStatus("loading");
    fetch("/api/memory-prompts/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrorMessage(data?.message || "This unsubscribe link is invalid or expired.");
          setStatus("error");
          return;
        }
        setPersonName(data?.personName ?? null);
        setStatus("success");
      })
      .catch(() => {
        setErrorMessage("Something went wrong. Please try the link again in a moment.");
        setStatus("error");
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6">
        <Link href="/">
          <div className="inline-flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
              <BookUser className="w-4 h-4" />
            </div>
            <span className="font-serif font-bold text-xl">Olive</span>
          </div>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card border rounded-2xl p-8 shadow-sm text-center space-y-4">
          {!token ? (
            <>
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">Missing unsubscribe link</h1>
              <p className="text-muted-foreground">
                This page needs a link from a memory-prompt email to know which prompts to turn off.
              </p>
            </>
          ) : status === "success" ? (
            <>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-primary" />
              </div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">You're unsubscribed</h1>
              <p className="text-muted-foreground">
                {personName
                  ? `You won't get any more memory prompts about ${personName}.`
                  : "You won't get any more memory prompts about this person."}
              </p>
              <p className="text-sm text-muted-foreground">
                This only affects prompts about this one person -- everything else from Olive still works as before.
              </p>
            </>
          ) : status === "error" ? (
            <>
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">Link invalid</h1>
              <p className="text-muted-foreground">{errorMessage}</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
                <CheckCircle2 className="w-6 h-6 text-primary" />
              </div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">Unsubscribing...</h1>
            </>
          )}

          <Link href="/">
            <Button className="w-full h-11 text-base mt-2">Back to Home</Button>
          </Link>
        </div>
      </main>

      <footer className="px-6 py-6 text-center">
        <Link href="/privacy">
          <span className="text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer">Privacy</span>
        </Link>
      </footer>
    </div>
  );
}
