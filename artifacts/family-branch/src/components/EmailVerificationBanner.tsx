import { useState } from "react";
import { useResendVerification } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Mail, X } from "lucide-react";

function dismissedKey(personId: string) {
  return `oliveVerifyBannerDismissed:${personId}`;
}

// Low-key, dismissible reminder that a logged-in account's email hasn't been
// confirmed yet. Deliberately not a modal or anything blocking -- email
// verification never gates account usage in this app, this is purely a
// nudge. Dismissal is per-account (keyed by personId, so it doesn't leak
// across accounts sharing a browser) and persists in localStorage rather
// than resetting on every navigation, but it isn't meant to be permanent --
// it comes back on the next fresh sign-in / browser.
export function EmailVerificationBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const resendMutation = useResendVerification();
  const [dismissed, setDismissed] = useState(
    () => !!user && localStorage.getItem(dismissedKey(user.id)) === "1",
  );

  if (!user || user.emailVerified || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(dismissedKey(user.id), "1");
    setDismissed(true);
  };

  const handleResend = () => {
    resendMutation.mutate(undefined, {
      onSuccess: (data) => {
        toast({ title: data?.message || "Verification email sent." });
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Couldn't send verification email",
          description: error?.message || "Please try again shortly.",
        });
      },
    });
  };

  return (
    <div className="print:hidden bg-secondary border-b px-4 py-2.5 flex items-center justify-center gap-3 text-sm flex-wrap">
      <div className="flex items-center gap-2 text-secondary-foreground">
        <Mail className="w-4 h-4 shrink-0" />
        <span>Please confirm your email address so account emails reach you.</span>
      </div>
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0 text-sm"
        disabled={resendMutation.isPending}
        onClick={handleResend}
      >
        {resendMutation.isPending ? "Sending..." : "Resend email"}
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={handleDismiss}
        className="text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
