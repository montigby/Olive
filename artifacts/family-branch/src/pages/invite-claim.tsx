import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useClaimProfile,
  useGetInvite,
  useMergePreview,
  useMergeConfirm,
  getGetInviteQueryKey,
} from "@workspace/api-client-react";
import type { MergePreviewResponse } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Link, useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { BookUser, Users, UserPlus, CheckCircle2 } from "lucide-react";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const claimSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const linkSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type ClaimForm = z.infer<typeof claimSchema>;
type LinkForm = z.infer<typeof linkSchema>;

// ─── Tab type ─────────────────────────────────────────────────────────────────

type ActiveTab = "create" | "link";
type MergeStep = "form" | "confirm";

// ─── Create Account Tab ───────────────────────────────────────────────────────

function CreateAccountTab({
  token,
  invite,
}: {
  token: string;
  invite: { firstName: string; lastName: string; unitName: string };
}) {
  const { login: setAuthToken } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const claimMutation = useClaimProfile();

  const form = useForm<ClaimForm>({
    resolver: zodResolver(claimSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (data: ClaimForm) => {
    claimMutation.mutate(
      { token, data },
      {
        onSuccess: (response: any) => {
          if (response?.token) {
            setAuthToken(response.token);
            setLocation("/welcome");
          }
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Claim failed",
            description: error?.message || "There was an error claiming your profile.",
          });
        },
      },
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  placeholder="you@example.com"
                  {...field}
                  className="bg-background"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Set Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="••••••••"
                  {...field}
                  className="bg-background"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full h-11 text-base mt-2"
          disabled={claimMutation.isPending}
        >
          {claimMutation.isPending ? "Creating account..." : "Create Account & Claim Profile"}
        </Button>
      </form>
    </Form>
  );
}

// ─── Link Existing Account Tab ────────────────────────────────────────────────

function LinkExistingTab({
  token,
  invite,
}: {
  token: string;
  invite: { firstName: string; lastName: string; unitName: string; relationshipLabel: string };
}) {
  const { login: setAuthToken } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<MergeStep>("form");
  const [previewData, setPreviewData] = useState<MergePreviewResponse | null>(null);
  const [savedCredentials, setSavedCredentials] = useState<{ email: string; password: string } | null>(null);

  const mergePreviewMutation = useMergePreview();
  const mergeConfirmMutation = useMergeConfirm();

  const form = useForm<LinkForm>({
    resolver: zodResolver(linkSchema),
    defaultValues: { email: "", password: "" },
  });

  const onPreview = (data: LinkForm) => {
    mergePreviewMutation.mutate(
      { token, data },
      {
        onSuccess: (response) => {
          setPreviewData(response);
          setSavedCredentials(data);
          setStep("confirm");
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Authentication failed",
            description: error?.message || "Could not verify your account. Check your email and password.",
          });
        },
      },
    );
  };

  const onConfirm = () => {
    if (!savedCredentials) return;
    mergeConfirmMutation.mutate(
      { token, data: savedCredentials },
      {
        onSuccess: (response: any) => {
          if (response?.token) {
            setAuthToken(response.token);
            setLocation("/welcome");
          }
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Merge failed",
            description: error?.message || "There was an error linking your account.",
          });
        },
      },
    );
  };

  if (step === "confirm" && previewData) {
    return (
      <div className="space-y-5">
        {/* Confirmation card */}
        <div className="rounded-xl border border-border bg-muted/30 p-5 space-y-3">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium text-sm">Account verified</span>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">
              You're logged in as{" "}
              <span className="font-medium text-foreground">
                {previewData.existingPerson.firstName} {previewData.existingPerson.lastName}
              </span>
              .
            </p>
            <p className="text-sm text-muted-foreground">
              You'll be joining{" "}
              <span className="font-medium text-foreground">{previewData.placeholder.unitName}</span>{" "}
              as{" "}
              <span className="font-medium text-foreground">
                {previewData.placeholder.firstName} {previewData.placeholder.lastName}
              </span>{" "}
              ({previewData.placeholder.relationshipLabel}).
            </p>
          </div>
          <div className="rounded-lg bg-background border border-border/60 p-3 text-xs text-muted-foreground">
            Your existing account will be linked to this family member profile. You'll sign in with
            the same email and password.
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            className="flex-1 h-11 text-base"
            onClick={onConfirm}
            disabled={mergeConfirmMutation.isPending}
          >
            {mergeConfirmMutation.isPending ? "Linking..." : "Confirm & Join Family"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setStep("form");
              setPreviewData(null);
              setSavedCredentials(null);
            }}
          >
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onPreview)} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Already have an Olive account? Sign in below to link it to your family member profile in{" "}
          <span className="font-medium text-foreground">{invite.unitName}</span>.
        </p>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  placeholder="you@example.com"
                  {...field}
                  className="bg-background"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="••••••••"
                  {...field}
                  className="bg-background"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full h-11 text-base mt-2"
          disabled={mergePreviewMutation.isPending}
        >
          {mergePreviewMutation.isPending ? "Verifying..." : "Verify & Preview"}
        </Button>
      </form>
    </Form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InviteClaim() {
  const { token } = useParams<{ token: string }>();
  const [activeTab, setActiveTab] = useState<ActiveTab>("create");

  const { data: invite, isLoading, error } = useGetInvite(token || "", {
    query: {
      enabled: !!token,
      queryKey: getGetInviteQueryKey(token || ""),
      retry: false,
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">Loading...</div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
            <span className="text-2xl">!</span>
          </div>
          <h1 className="text-2xl font-serif font-bold">Invalid or Expired Invite</h1>
          <p className="text-muted-foreground">
            This invitation link is no longer valid. Please ask your family admin to send a new one.
          </p>
          <Link href="/">
            <Button variant="outline" className="mt-4">
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

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
        <div className="w-full max-w-md bg-card border rounded-2xl p-8 shadow-sm">
          <div className="text-center mb-7">
            <h1 className="font-serif text-3xl font-semibold mb-2 text-foreground">
              Welcome to the family
            </h1>
            <p className="text-muted-foreground text-sm">
              {invite.unitName} is waiting for you. Join as{" "}
              <span className="font-medium text-foreground">
                {invite.firstName} {invite.lastName}
              </span>{" "}
              ({invite.relationshipLabel}).
            </p>
          </div>

          {/* Tabs */}
          <div className="flex rounded-lg border border-border bg-muted/40 p-1 mb-6 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("create")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === "create"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Create account
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("link")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === "link"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Link existing
            </button>
          </div>

          {/* Tab content */}
          {activeTab === "create" ? (
            <CreateAccountTab token={token || ""} invite={invite} />
          ) : (
            <LinkExistingTab token={token || ""} invite={invite} />
          )}
        </div>
      </main>
    </div>
  );
}
