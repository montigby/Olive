// Phase 3 of the shared-invite flow — the public claimer UI mounted at
// /join/:token. State-machine driven; one component per logical screen
// per the spec (A landing, B identify, C confirm, C-multi pick, E create,
// D credentials, F pending, G handoff to onboarding, H rejected).
//
// Talks directly to the Phase 2 endpoints via fetch (no orval regeneration
// for this iteration). All requests carry the invite token in the body so
// the server can re-validate it on every call.

import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Leaf, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

type ResolveResp = {
  family: { unitName: string };
  inviter: { firstName: string; lastName: string } | null;
};

type Candidate = {
  id: string;
  firstName: string;
  lastName: string | null;
  parents: { id: string; firstName: string }[];
  spouse: { id: string; firstName: string } | null;
  birthYear: number | null;
};

type MatchResp = {
  overflow: boolean;
  candidates: Candidate[];
};

type ClaimResp = { id: string; status: string; createdAt: string };
type PollResp = {
  id: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  decidedAt: string | null;
  type: "claim_existing" | "create_new";
};

type Step =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "landing"; family: ResolveResp }
  | { kind: "identify"; family: ResolveResp; name: string; busy: boolean; error?: string }
  | {
      kind: "pick";
      family: ResolveResp;
      name: string;
      candidates: Candidate[];
      overflow: boolean;
    }
  | { kind: "noMatch"; family: ResolveResp; name: string }
  | {
      kind: "credentials";
      family: ResolveResp;
      name: string;
      target: Candidate;
      email: string;
      password: string;
      busy: boolean;
      error?: string;
    }
  | {
      kind: "createNew";
      family: ResolveResp;
      name: string;
      email: string;
      password: string;
      busy: boolean;
      error?: string;
    }
  | { kind: "pending"; family: ResolveResp; claimId: string }
  | { kind: "rejected"; family: ResolveResp; claimId: string };

function hint(c: Candidate): string {
  const pieces: string[] = [];
  if (c.parents.length > 0) {
    pieces.push(`child of ${c.parents.map((p) => p.firstName).join(" & ")}`);
  }
  if (c.spouse) pieces.push(`spouse of ${c.spouse.firstName}`);
  if (c.birthYear) pieces.push(`b. ${c.birthYear}`);
  return pieces.join(" · ");
}

function fullName(c: Candidate): string {
  return c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName;
}

export default function Join() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [step, setStep] = useState<Step>({ kind: "loading" });

  // ── Resolve the token on mount ──
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/join/${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { message?: string };
          setStep({
            kind: "invalid",
            message:
              body.message ||
              (r.status === 410
                ? "This invite has expired or been revoked."
                : "This invite link isn't valid."),
          });
          return;
        }
        const family = (await r.json()) as ResolveResp;
        setStep({ kind: "landing", family });
      } catch {
        if (!cancelled) setStep({ kind: "invalid", message: "Network error." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ── Polling while pending ──
  useEffect(() => {
    if (step.kind !== "pending") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/claims/${step.claimId}`);
        if (cancelled || !r.ok) return;
        const body = (await r.json()) as PollResp;
        if (body.status === "approved") {
          // Approval flow returns a token via the approve handler; we re-fetch
          // it once here. The server gives us nothing more on poll, so we
          // direct the claimer to log in (their credentials are already
          // attached to a fresh account row).
          setLocation("/login");
        } else if (body.status === "rejected") {
          setStep({ kind: "rejected", family: step.family, claimId: step.claimId });
        }
      } catch {
        /* swallow network blips, the next tick retries */
      }
    };
    const handle = window.setInterval(tick, 4000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [step, setLocation]);

  // ────────────────────────────────────────────────────────────────────────
  // Shell — every screen renders inside this card-on-canvas
  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2 text-primary">
          <Leaf className="w-6 h-6" />
          <span className="font-serif text-2xl font-bold">Olive</span>
        </div>
        <Card>
          <CardContent className="p-6 space-y-5">
            <Screen step={step} setStep={setStep} token={token!} login={login} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Screen — single big switch over the state-machine kind. The state object
// always carries everything the inner screen needs so transitions stay local.
// ──────────────────────────────────────────────────────────────────────────
function Screen({
  step,
  setStep,
  token,
  login,
}: {
  step: Step;
  setStep: (s: Step) => void;
  token: string;
  login: (jwt: string) => void;
}) {
  switch (step.kind) {
    case "loading":
      return (
        <div className="py-6 text-center text-muted-foreground flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p>Checking your invite…</p>
        </div>
      );

    case "invalid":
      return (
        <div className="space-y-4 text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
          <h2 className="font-serif text-2xl font-bold">Hmm, this link doesn't work</h2>
          <p className="text-muted-foreground">{step.message}</p>
          <p className="text-sm text-muted-foreground">
            Ask whoever sent you the link to share a fresh one.
          </p>
          <Link href="/login">
            <Button variant="outline" className="w-full">Go to sign in</Button>
          </Link>
        </div>
      );

    case "landing":
      return <Landing family={step.family} onNext={() => setStep({ kind: "identify", family: step.family, name: "", busy: false })} />;

    case "identify":
      return (
        <Identify
          step={step}
          setStep={setStep}
          token={token}
        />
      );

    case "pick":
      return (
        <PickCandidate
          family={step.family}
          candidates={step.candidates}
          overflow={step.overflow}
          onPick={(target) =>
            setStep({
              kind: "credentials",
              family: step.family,
              name: step.name,
              target,
              email: "",
              password: "",
              busy: false,
            })
          }
          onNotListed={() =>
            setStep({ kind: "noMatch", family: step.family, name: step.name })
          }
          onBack={() =>
            setStep({ kind: "identify", family: step.family, name: step.name, busy: false })
          }
        />
      );

    case "noMatch":
      return (
        <div className="space-y-4 text-center">
          <h2 className="font-serif text-2xl font-bold">Let's add you</h2>
          <p className="text-muted-foreground">
            We didn't find an existing profile for <strong>{step.name}</strong> in {step.family.family.unitName}. You can ask the family organizer to add you, or create a new profile that they'll review.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() =>
                setStep({
                  kind: "createNew",
                  family: step.family,
                  name: step.name,
                  email: "",
                  password: "",
                  busy: false,
                })
              }
            >
              Create a new profile
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                setStep({ kind: "identify", family: step.family, name: step.name, busy: false })
              }
            >
              Search again
            </Button>
          </div>
        </div>
      );

    case "credentials":
      return <Credentials token={token} step={step} setStep={setStep} />;

    case "createNew":
      return <CreateNew token={token} step={step} setStep={setStep} />;

    case "pending":
      return (
        <div className="space-y-4 text-center">
          <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin" />
          <h2 className="font-serif text-2xl font-bold">Waiting on approval</h2>
          <p className="text-muted-foreground">
            We've let the {step.family.family.unitName} admins know you're claiming this profile. You'll get access once they confirm.
          </p>
          <p className="text-sm text-muted-foreground">
            This page will update automatically. Keep it open or come back later.
          </p>
        </div>
      );

    case "rejected":
      return (
        <div className="space-y-4 text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
          <h2 className="font-serif text-2xl font-bold">Claim wasn't approved</h2>
          <p className="text-muted-foreground">
            The {step.family.family.unitName} admins didn't approve this claim. Reach out to whoever sent you the invite if you think this is a mistake.
          </p>
          <Link href="/login">
            <Button variant="outline" className="w-full">Go to sign in</Button>
          </Link>
        </div>
      );
  }
  // Exhaustive — tsc enforces.
  void login;
  return null;
}

function Landing({ family, onNext }: { family: ResolveResp; onNext: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <h1 className="font-serif text-3xl font-bold">You've been invited</h1>
      <p className="text-muted-foreground">
        {family.inviter ? (
          <>
            <strong>
              {family.inviter.firstName} {family.inviter.lastName}
            </strong>{" "}
            invited you to join
          </>
        ) : (
          "You've been invited to join"
        )}{" "}
        <strong>{family.family.unitName}</strong>.
      </p>
      <Button onClick={onNext} className="w-full">
        Find my profile <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}

function Identify({
  step,
  setStep,
  token,
}: {
  step: Extract<Step, { kind: "identify" }>;
  setStep: (s: Step) => void;
  token: string;
}) {
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step.name.trim()) return;
    setStep({ ...step, busy: true, error: undefined });
    try {
      const r = await fetch("/api/claims/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: step.name.trim() }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string };
        setStep({ ...step, busy: false, error: body.message || "Couldn't search right now." });
        return;
      }
      const data = (await r.json()) as MatchResp;
      if (data.candidates.length === 0) {
        setStep({ kind: "noMatch", family: step.family, name: step.name });
      } else {
        setStep({
          kind: "pick",
          family: step.family,
          name: step.name,
          candidates: data.candidates,
          overflow: data.overflow,
        });
      }
    } catch {
      setStep({ ...step, busy: false, error: "Network error." });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="font-serif text-2xl font-bold">What's your name?</h2>
      <p className="text-sm text-muted-foreground">
        We'll use this to find your existing profile in {step.family.family.unitName}.
      </p>
      <Input
        autoFocus
        placeholder="First and last name"
        value={step.name}
        onChange={(e) => setStep({ ...step, name: e.target.value, error: undefined })}
        disabled={step.busy}
      />
      {step.error && <p className="text-sm text-destructive">{step.error}</p>}
      <Button type="submit" disabled={step.busy || step.name.trim().length < 2} className="w-full">
        {step.busy ? "Searching…" : "Continue"}
      </Button>
    </form>
  );
}

function PickCandidate({
  family,
  candidates,
  overflow,
  onPick,
  onNotListed,
  onBack,
}: {
  family: ResolveResp;
  candidates: Candidate[];
  overflow: boolean;
  onPick: (c: Candidate) => void;
  onNotListed: () => void;
  onBack: () => void;
}) {
  const heading = useMemo(() => {
    if (candidates.length === 1) return "Is this you?";
    return "Pick your profile";
  }, [candidates.length]);

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-2xl font-bold">{heading}</h2>
      {overflow && (
        <p className="text-sm text-muted-foreground">
          We found several matches. Pick the closest, or tell us you're not listed.
        </p>
      )}
      <div className="space-y-2">
        {candidates.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c)}
            className="w-full text-left p-4 rounded-xl border hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <div className="font-medium">{fullName(c)}</div>
            {hint(c) && <div className="text-xs text-muted-foreground mt-1">{hint(c)}</div>}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 pt-2">
        <Button variant="outline" onClick={onNotListed}>
          I'm not listed
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Search again
        </Button>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        in {family.family.unitName}
      </p>
    </div>
  );
}

function Credentials({
  token,
  step,
  setStep,
}: {
  token: string;
  step: Extract<Step, { kind: "credentials" }>;
  setStep: (s: Step) => void;
}) {
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step.email || !step.password) return;
    setStep({ ...step, busy: true, error: undefined });
    try {
      const r = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          type: "claim_existing",
          targetPersonId: step.target.id,
          claimerName: step.name,
          claimerEmail: step.email,
          claimerPassword: step.password,
        }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string };
        setStep({ ...step, busy: false, error: body.message || "Couldn't submit your claim." });
        return;
      }
      const data = (await r.json()) as ClaimResp;
      setStep({ kind: "pending", family: step.family, claimId: data.id });
    } catch {
      setStep({ ...step, busy: false, error: "Network error." });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="font-serif text-2xl font-bold">Set up your sign-in</h2>
      <p className="text-sm text-muted-foreground">
        You're claiming <strong>{fullName(step.target)}</strong>. Set the email and password you'll use to sign in once your claim is approved.
      </p>
      <Input
        type="email"
        autoComplete="email"
        placeholder="Email"
        value={step.email}
        onChange={(e) => setStep({ ...step, email: e.target.value, error: undefined })}
        disabled={step.busy}
      />
      <Input
        type="password"
        autoComplete="new-password"
        placeholder="Password (8+ characters)"
        value={step.password}
        onChange={(e) => setStep({ ...step, password: e.target.value, error: undefined })}
        disabled={step.busy}
      />
      {step.error && <p className="text-sm text-destructive">{step.error}</p>}
      <Button
        type="submit"
        disabled={step.busy || !step.email || step.password.length < 8}
        className="w-full"
      >
        {step.busy ? "Submitting…" : "Submit claim for approval"}
      </Button>
    </form>
  );
}

function CreateNew({
  token,
  step,
  setStep,
}: {
  token: string;
  step: Extract<Step, { kind: "createNew" }>;
  setStep: (s: Step) => void;
}) {
  // V1: no attaching-relationship picker — the admin uses the inbox to set
  // those up at approval time. The claim payload still carries name + creds
  // so account creation is atomic on approval.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step.email || !step.password) return;
    setStep({ ...step, busy: true, error: undefined });
    try {
      const r = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          type: "create_new",
          claimerName: step.name,
          claimerEmail: step.email,
          claimerPassword: step.password,
        }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string };
        setStep({ ...step, busy: false, error: body.message || "Couldn't submit your request." });
        return;
      }
      const data = (await r.json()) as ClaimResp;
      setStep({ kind: "pending", family: step.family, claimId: data.id });
    } catch {
      setStep({ ...step, busy: false, error: "Network error." });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="font-serif text-2xl font-bold">Tell us about you</h2>
      <p className="text-sm text-muted-foreground">
        We'll create a new profile for <strong>{step.name}</strong> in {step.family.family.unitName} and the admins will confirm where you fit in the tree.
      </p>
      <Input
        type="email"
        autoComplete="email"
        placeholder="Email"
        value={step.email}
        onChange={(e) => setStep({ ...step, email: e.target.value, error: undefined })}
        disabled={step.busy}
      />
      <Input
        type="password"
        autoComplete="new-password"
        placeholder="Password (8+ characters)"
        value={step.password}
        onChange={(e) => setStep({ ...step, password: e.target.value, error: undefined })}
        disabled={step.busy}
      />
      {step.error && <p className="text-sm text-destructive">{step.error}</p>}
      <Button
        type="submit"
        disabled={step.busy || !step.email || step.password.length < 8}
        className="w-full"
      >
        {step.busy ? "Submitting…" : "Submit request"}
      </Button>
    </form>
  );
}
