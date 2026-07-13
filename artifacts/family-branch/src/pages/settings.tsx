import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import {
  useGetFamilyUnit, getGetFamilyUnitQueryKey,
  useUpdateFamilyUnit,
  useListLinkRequests, getListLinkRequestsQueryKey,
  useAcceptLinkRequest,
  useDeclineLinkRequest,
  useListMembers, getListMembersQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Network, Save, Check, X, Building2, User, Link2, Copy, RefreshCw, UserCheck, ShieldCheck, UserPlus2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const unitSchema = z.object({
  unitName: z.string().min(1, "Family unit name is required"),
});

export default function Settings() {
  const { user } = useAuth();
  const unitId = user?.familyUnit.id || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: unit, isLoading: isUnitLoading } = useGetFamilyUnit(unitId, {
    query: {
      enabled: !!unitId,
      queryKey: getGetFamilyUnitQueryKey(unitId)
    }
  });

  const { data: linkRequests, isLoading: isRequestsLoading } = useListLinkRequests(unitId, {
    query: {
      enabled: !!unitId,
      queryKey: getListLinkRequestsQueryKey(unitId)
    }
  });

  const updateUnitMutation = useUpdateFamilyUnit();
  const acceptMutation = useAcceptLinkRequest();
  const declineMutation = useDeclineLinkRequest();

  const form = useForm<z.infer<typeof unitSchema>>({
    resolver: zodResolver(unitSchema),
    values: {
      unitName: unit?.unitName || "",
    },
  });

  const onUpdateUnit = (data: z.infer<typeof unitSchema>) => {
    updateUnitMutation.mutate({ unitId, data }, {
      onSuccess: () => {
        toast({ title: "Settings saved successfully" });
        queryClient.invalidateQueries({ queryKey: getGetFamilyUnitQueryKey(unitId) });
      },
      onError: (error: any) => {
        toast({ variant: "destructive", title: "Update failed", description: error?.message });
      }
    });
  };

  const handleRequest = (requestId: string, action: 'accept' | 'decline') => {
    const mutation = action === 'accept' ? acceptMutation : declineMutation;
    
    mutation.mutate({ requestId }, {
      onSuccess: () => {
        toast({ title: `Request ${action}ed` });
        queryClient.invalidateQueries({ queryKey: getListLinkRequestsQueryKey(unitId) });
      },
      onError: (error: any) => {
        toast({ variant: "destructive", title: "Action failed", description: error?.message });
      }
    });
  };

  if (!user?.isAdmin) {
    const canInvite = (unit as any)?.membersCanInvite !== false;
    return (
      <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your account and family unit.</p>
        </div>
        {canInvite && <SharedInviteCard unitId={unitId} readOnly />}
        <ChangePasswordCard />
        <Card className="border-none shadow-sm bg-card">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Looking to update your info?</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Edit your name, contact details, birthday, and social links from your profile page.
              </p>
            </div>
            <Link href="/profile">
              <Button className="mt-2">Go to My Profile</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const incomingRequests = linkRequests?.incoming.filter(r => r.status === 'pending') || [];
  const outgoingRequests = linkRequests?.outgoing.filter(r => r.status === 'pending') || [];

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Unit Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your family unit details and connections.</p>
      </div>

      <Card className="border-none shadow-sm bg-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" /> Directory Details
          </CardTitle>
          <CardDescription>Update your family unit name.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onUpdateUnit)} className="space-y-4 max-w-md">
              <FormField
                control={form.control}
                name="unitName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Family Name</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="pt-2">
                <label className="text-sm font-medium leading-none">Unique Unit Code</label>
                <div className="flex items-center gap-4 mt-2">
                  <code className="px-4 py-2 bg-secondary rounded font-mono text-lg tracking-wider text-secondary-foreground">
                    {unit?.unitCode || "------"}
                  </code>
                  <p className="text-sm text-muted-foreground">Share this code to let other family units find you easily.</p>
                </div>
              </div>

              <Button type="submit" className="mt-4" disabled={updateUnitMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm bg-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" /> Connection Requests
          </CardTitle>
          <CardDescription>Manage incoming and outgoing links to other family branches.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          <div>
            <h3 className="font-medium mb-4 text-sm uppercase tracking-wider text-muted-foreground">Incoming Requests</h3>
            {incomingRequests.length === 0 ? (
              <div className="p-4 text-center rounded-lg border border-dashed text-muted-foreground bg-[#FAF7F2]">
                No pending connection requests.
              </div>
            ) : (
              <div className="space-y-3">
                {incomingRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between p-4 rounded-lg bg-[#FAF7F2] border border-border/50">
                    <div>
                      <p className="font-bold">{req.requestingUnitName}</p>
                      <p className="text-sm text-muted-foreground mt-1">Requested by {req.connectorPersonName}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-destructive hover:bg-destructive hover:text-white"
                        onClick={() => handleRequest(req.id, 'decline')}
                        disabled={declineMutation.isPending || acceptMutation.isPending}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        className="bg-primary hover:bg-primary/90"
                        onClick={() => handleRequest(req.id, 'accept')}
                        disabled={declineMutation.isPending || acceptMutation.isPending}
                      >
                        <Check className="w-4 h-4 mr-1" /> Accept
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-medium mb-4 text-sm uppercase tracking-wider text-muted-foreground">Outgoing Requests</h3>
            {outgoingRequests.length === 0 ? (
              <div className="p-4 text-center rounded-lg border border-dashed text-muted-foreground bg-[#FAF7F2]">
                No outgoing connection requests.
              </div>
            ) : (
              <div className="space-y-3">
                {outgoingRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between p-4 rounded-lg bg-[#FAF7F2] border border-border/50">
                    <div>
                      <p className="font-bold">To: {req.targetUnitName}</p>
                      <p className="text-sm text-muted-foreground mt-1">Connecting through {req.connectorPersonName}</p>
                    </div>
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-200">
                      Pending
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AdminsCard unitId={unitId} />
      <MemberPermissionsCard unitId={unitId} membersCanInvite={(unit as any)?.membersCanInvite ?? true} />
      <SharedInviteCard unitId={unitId} />
      <PendingClaimsCard unitId={unitId} />
      <ChangePasswordCard />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Change password — available to all users
// ──────────────────────────────────────────────────────────────────────────
function ChangePasswordCard() {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast({ variant: "destructive", title: "Passwords don't match." });
      return;
    }
    if (next.length < 8) {
      toast({ variant: "destructive", title: "New password must be at least 8 characters." });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("oliveToken") ?? ""}`,
        },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (r.ok) {
        toast({ title: "Password updated." });
        setCurrent(""); setNext(""); setConfirm("");
      } else {
        const body = await r.json().catch(() => ({})) as { error?: string };
        toast({ variant: "destructive", title: body.error ?? "Couldn't update password." });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-none shadow-sm bg-card">
      <CardHeader>
        <CardTitle className="font-serif text-xl">Change Password</CardTitle>
        <CardDescription>Update your account password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3 max-w-sm">
          <div className="space-y-1">
            <label className="text-sm font-medium">Current password</label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className="bg-background" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">New password</label>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} className="bg-background" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Confirm new password</label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="bg-background" />
          </div>
          <Button type="submit" disabled={saving || !current || !next || !confirm} className="mt-1">
            {saving ? "Saving…" : "Update Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Admins overview (admin only) — a dedicated, clearly-labeled place to see
// everyone with admin access and grant/revoke it, separate from the
// per-person quick action in the Directory's "⋮" menu on each member card.
// ──────────────────────────────────────────────────────────────────────────
type SettingsMember = {
  id: string;
  firstName: string;
  lastName: string;
  relationshipLabel: string;
  isAdmin: boolean;
  claimed: boolean;
};

function AdminsCard({ unitId }: { unitId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: members, isLoading } = useListMembers(unitId, {
    query: { enabled: !!unitId, queryKey: getListMembersQueryKey(unitId) },
  });

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string; nextIsAdmin: boolean } | null>(null);
  const [grantPersonId, setGrantPersonId] = useState<string>("");

  const typedMembers = (members ?? []) as unknown as SettingsMember[];
  const admins = typedMembers.filter((m) => m.isAdmin);
  const grantable = typedMembers.filter((m) => m.claimed && !m.isAdmin);

  const setAdmin = async (personId: string, nextIsAdmin: boolean) => {
    setTogglingId(personId);
    try {
      const token = localStorage.getItem("oliveToken");
      const r = await fetch(`/api/persons/${personId}/admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isAdmin: nextIsAdmin }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: nextIsAdmin ? "Couldn't grant admin access" : "Couldn't remove admin access",
          description: body.message || "Please try again.",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: getListMembersQueryKey(unitId) });
      toast({ title: nextIsAdmin ? "Admin access granted" : "Admin access removed" });
      if (nextIsAdmin) setGrantPersonId("");
    } catch {
      toast({ variant: "destructive", title: "Network error", description: "Please try again." });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <>
      <Card className="border-none shadow-sm bg-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> Admins
          </CardTitle>
          <CardDescription>
            Admins can edit anyone's profile, add or remove family members, and grant or revoke
            admin access for others. A family unit always keeps at least one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              <div className="space-y-2">
                {admins.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#FAF7F2] border border-border/50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{m.firstName} {m.lastName}</p>
                      <p className="text-xs text-muted-foreground">{m.relationshipLabel}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive hover:text-white shrink-0"
                      disabled={togglingId === m.id || admins.length <= 1}
                      title={admins.length <= 1 ? "A family unit must always have at least one admin" : undefined}
                      onClick={() => setConfirmTarget({ id: m.id, name: m.firstName, nextIsAdmin: false })}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-border/50">
                <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <UserPlus2 className="w-3.5 h-3.5 text-muted-foreground" /> Grant admin access
                </p>
                {grantable.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Everyone with a claimed profile already has admin access.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <Select value={grantPersonId} onValueChange={setGrantPersonId}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select a member…" />
                      </SelectTrigger>
                      <SelectContent>
                        {grantable.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.firstName} {m.lastName} ({m.relationshipLabel})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      disabled={!grantPersonId || togglingId === grantPersonId}
                      className="shrink-0"
                      onClick={() => {
                        const m = grantable.find((g) => g.id === grantPersonId);
                        if (m) setConfirmTarget({ id: m.id, name: m.firstName, nextIsAdmin: true });
                      }}
                    >
                      Grant
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.nextIsAdmin
                ? `Make ${confirmTarget.name} an admin?`
                : `Remove admin access from ${confirmTarget?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.nextIsAdmin
                ? "Admins can edit anyone's profile, add or remove family members, and grant or revoke admin access for others. Only give this to someone you'd trust to help run the family directory."
                : "They'll no longer be able to edit other members' profiles, add or remove people, or manage who else has admin access. Their own profile isn't affected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmTarget && !confirmTarget.nextIsAdmin
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              disabled={!!togglingId}
              onClick={() => {
                if (!confirmTarget) return;
                void setAdmin(confirmTarget.id, confirmTarget.nextIsAdmin);
              }}
            >
              {confirmTarget?.nextIsAdmin ? "Make admin" : "Remove access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Shared invite token — Phase 4
// ──────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────
// Member permissions toggle (admin only)
// ──────────────────────────────────────────────────────────────────────────
function MemberPermissionsCard({ unitId, membersCanInvite }: { unitId: string; membersCanInvite: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [localValue, setLocalValue] = useState(membersCanInvite);

  useEffect(() => { setLocalValue(membersCanInvite); }, [membersCanInvite]);

  const toggle = async () => {
    const newValue = !localValue;
    setLocalValue(newValue);
    setSaving(true);
    try {
      const r = await fetch(`/api/family-units/${unitId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("oliveToken") ?? ""}`,
        },
        body: JSON.stringify({ membersCanInvite: newValue }),
      });
      if (r.ok) {
        queryClient.invalidateQueries({ queryKey: getGetFamilyUnitQueryKey(unitId) });
        toast({ title: newValue ? "Members can now share the invite link" : "Invite link restricted to admins" });
      } else {
        setLocalValue(!newValue);
        toast({ variant: "destructive", title: "Couldn't update setting" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-none shadow-sm bg-card">
      <CardHeader>
        <CardTitle className="font-serif text-xl flex items-center gap-2">
          <User className="w-5 h-5 text-primary" /> Member Permissions
        </CardTitle>
        <CardDescription>Control what family members are allowed to do.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Members can share invite link</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When on, any family member can copy and share the invite link from their Settings page.
            </p>
          </div>
          <Button
            variant={localValue ? "default" : "outline"}
            size="sm"
            onClick={toggle}
            disabled={saving}
            className="shrink-0 w-16"
          >
            {localValue ? "On" : "Off"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SharedInviteCard({ unitId, readOnly = false }: { unitId: string; readOnly?: boolean }) {
  const { toast } = useToast();
  const [active, setActive] = useState<{ token: string; url: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchActive = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/family-units/${unitId}/invite-tokens`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("oliveToken") ?? ""}` },
      });
      if (r.ok) {
        const data = (await r.json()) as { active: { token: string; url: string } | null };
        setActive(data.active);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchActive(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [unitId]);

  const regenerate = async () => {
    setWorking(true);
    try {
      const r = await fetch(`/api/family-units/${unitId}/invite-tokens`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("oliveToken") ?? ""}` },
      });
      if (r.ok) {
        const data = (await r.json()) as { token: string; url: string };
        setActive({ token: data.token, url: data.url });
        toast({ title: "New invite link created", description: "The old link is now invalid." });
      } else {
        toast({ variant: "destructive", title: "Couldn't regenerate", description: "Please try again." });
      }
    } finally {
      setWorking(false);
    }
  };

  const copy = async () => {
    if (!active?.url) return;
    try {
      await navigator.clipboard.writeText(active.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy", description: "Copy the URL manually." });
    }
  };

  return (
    <Card className="border-none shadow-sm bg-card">
      <CardHeader>
        <CardTitle className="font-serif text-xl flex items-center gap-2">
          <Link2 className="w-5 h-5 text-primary" /> Family invite link
        </CardTitle>
        <CardDescription>
          Share one link that any family member can use to claim their profile.
          You'll review each claim before access is granted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : active ? (
          <>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[#FAF7F2] border border-border/50">
              <code className="flex-1 truncate font-mono text-sm">{active.url}</code>
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span className="ml-2 hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>
            {!readOnly && (
              <>
                <Button variant="outline" onClick={regenerate} disabled={working}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${working ? "animate-spin" : ""}`} />
                  {working ? "Generating…" : "Regenerate link"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Regenerating immediately invalidates the previous link.
                </p>
              </>
            )}
          </>
        ) : readOnly ? (
          <p className="text-sm text-muted-foreground">No invite link is active yet. Ask an admin to create one.</p>
        ) : (
          <Button onClick={regenerate} disabled={working}>
            <Link2 className="w-4 h-4 mr-2" />
            {working ? "Creating…" : "Create invite link"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Pending claims inbox — Phase 4
// ──────────────────────────────────────────────────────────────────────────
type PendingClaim = {
  id: string;
  type: "claim_existing" | "create_new";
  targetPersonId: string | null;
  claimerDisplayName: string;
  claimerContact: string | null;
  claimerSignal: Record<string, unknown> & {
    arrival?: { ua: string | null; ip: string | null };
  };
  status: string;
  createdAt: string;
};

function PendingClaimsCard({ unitId }: { unitId: string }) {
  const { toast } = useToast();
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const fetchClaims = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/family-units/${unitId}/claims?status=pending`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("oliveToken") ?? ""}` },
      });
      if (r.ok) {
        const data = (await r.json()) as { claims: PendingClaim[] };
        setClaims(data.claims);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchClaims(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [unitId]);

  const act = async (claim: PendingClaim, action: "approve" | "reject") => {
    setActingOn(claim.id);
    try {
      const r = await fetch(`/api/family-units/${unitId}/claims/${claim.id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("oliveToken") ?? ""}` },
      });
      if (r.ok) {
        toast({
          title: action === "approve" ? "Approved" : "Rejected",
          description:
            action === "approve"
              ? `${claim.claimerDisplayName} can now sign in.`
              : `${claim.claimerDisplayName}'s claim was rejected.`,
        });
        setClaims((cs) => cs.filter((c) => c.id !== claim.id));
      } else {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        toast({
          variant: "destructive",
          title: "Couldn't act on claim",
          description: body.error ?? "Please try again.",
        });
      }
    } finally {
      setActingOn(null);
    }
  };

  return (
    <Card className="border-none shadow-sm bg-card">
      <CardHeader>
        <CardTitle className="font-serif text-xl flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-primary" /> Pending claims
          {claims.length > 0 && <Badge variant="secondary">{claims.length}</Badge>}
        </CardTitle>
        <CardDescription>
          People who used the invite link and are waiting on your approval.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : claims.length === 0 ? (
          <div className="p-4 text-center rounded-lg border border-dashed text-muted-foreground bg-[#FAF7F2]">
            No pending claims.
          </div>
        ) : (
          <div className="space-y-3">
            {claims.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-3 p-4 rounded-lg bg-[#FAF7F2] border border-border/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{c.claimerDisplayName}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {c.type === "claim_existing"
                      ? "Claiming an existing profile"
                      : "Requesting a new profile"}
                    {c.claimerContact ? ` · ${c.claimerContact}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Submitted {new Date(c.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive hover:text-white"
                    onClick={() => act(c, "reject")}
                    disabled={actingOn === c.id}
                  >
                    <X className="w-4 h-4 mr-1" /> Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => act(c, "approve")}
                    disabled={actingOn === c.id}
                  >
                    <Check className="w-4 h-4 mr-1" /> Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
