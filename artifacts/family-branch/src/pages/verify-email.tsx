import { useEffect, useMemo, useRef } from "react";
import { useVerifyEmail } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BookUser, AlertCircle, CheckCircle2 } from "lucide-react";

export default function VerifyEmail() {
  const verifyEmailMutation = useVerifyEmail();
  const attempted = useRef(false);

  // Wouter's route matching doesn't expose the query string, so read it
  // directly off window.location -- the same pattern reset-password.tsx uses
  // for its one-off token param.
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token"),
    [],
  );

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    verifyEmailMutation.mutate({ data: { token } });
    // verifyEmailMutation is a fresh object identity every render (TanStack
    // Query mutation objects aren't memoized), so it's deliberately omitted
    // here -- including it would refire this on every render instead of once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <h1 className="font-serif text-2xl font-semibold text-foreground">Missing verification link</h1>
              <p className="text-muted-foreground">
                This page needs a verification token from your email link. You can request a new one from Settings.
              </p>
            </>
          ) : verifyEmailMutation.isSuccess ? (
            <>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-primary" />
              </div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">Email confirmed</h1>
              <p className="text-muted-foreground">Thanks for confirming your email address.</p>
            </>
          ) : verifyEmailMutation.isError ? (
            <>
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">Link invalid or expired</h1>
              <p className="text-muted-foreground">
                {(verifyEmailMutation.error as any)?.message ||
                  "This verification link is invalid or has expired. You can request a new one from Settings."}
              </p>
              <p className="text-sm text-muted-foreground">
                Your account still works normally either way -- this doesn't affect your access.
              </p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
                <CheckCircle2 className="w-6 h-6 text-primary" />
              </div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">Confirming...</h1>
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
