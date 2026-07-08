import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import {
  useListMembers, getListMembersQueryKey,
  useAddMember,
  useGenerateInvite,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, CheckCircle2, ChevronRight, Copy, Link as LinkIcon, Users, Eye, ArrowUpDown, Search } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";

const RELATIONSHIP_OPTIONS = [
  {
    group: "Women",
    options: ["Daughter", "Granddaughter", "Sister", "Aunt", "Niece", "Wife", "Mom", "Grandma", "Nana", "Stepdaughter"],
  },
  {
    group: "Men",
    options: ["Son", "Grandson", "Brother", "Uncle", "Nephew", "Husband", "Dad", "Grandpa", "Papa", "Stepson"],
  },
  {
    group: "Other",
    options: ["Partner", "Spouse", "Cousin", "In-Law", "Stepparent", "Guardian", "Other"],
  },
];

const ALL_ROLES = RELATIONSHIP_OPTIONS.flatMap((g) => g.options);

const addMemberSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  relationshipLabel: z.string().min(1, "Please select a relationship"),
  parentPersonId: z.string().nullable().optional(),
});

type AddMemberForm = z.infer<typeof addMemberSchema>;

export default function Members() {
  const { user } = useAuth();
  const unitId = user?.familyUnit.id || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [inviteTokenMap, setInviteTokenMap] = useState<Record<string, string>>({});
  const [sortMode, setSortMode] = useState<"added" | "az" | "za" | "side">("added");
  const [search, setSearch] = useState("");

  const { data: members, isLoading } = useListMembers(unitId, {
    query: {
      enabled: !!unitId,
      queryKey: getListMembersQueryKey(unitId),
    },
  });

  const addMemberMutation = useAddMember();
  const generateInviteMutation = useGenerateInvite();

  const form = useForm<AddMemberForm>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      firstName: "",
      lastName: user?.lastName || "",
      relationshipLabel: "",
      parentPersonId: null,
    },
  });

  const selectedRole = form.watch("relationshipLabel");
  const isGrandchildRole = ["Grandson", "Granddaughter"].includes(selectedRole);

  const onSubmit = (data: AddMemberForm) => {
    addMemberMutation.mutate(
      {
        unitId,
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          relationshipLabel: data.relationshipLabel,
          parentPersonId: data.parentPersonId || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Member added successfully" });
          queryClient.invalidateQueries({ queryKey: getListMembersQueryKey(unitId) });
          setIsAddOpen(false);
          form.reset();
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Failed to add member",
            description: error?.message || "Please try again.",
          });
        },
      }
    );
  };

  const handleGenerateInvite = (personId: string) => {
    generateInviteMutation.mutate(
      { unitId, personId },
      {
        onSuccess: (data) => {
          setInviteTokenMap((prev) => ({ ...prev, [personId]: data.inviteUrl }));
          toast({ title: "Invite link generated!" });
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Failed to generate invite",
            description: error?.message,
          });
        },
      }
    );
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard!" });
    } catch {
      toast({ variant: "destructive", title: "Failed to copy" });
    }
  };

  // Members eligible to be a "parent" in the tree (children who can have their own kids)
  const parentCandidates = (members || []).filter((m) =>
    ["Son", "Daughter", "Stepson", "Stepdaughter"].includes(m.relationshipLabel)
  );

  // Sorted / grouped member list for display
  type MemberSection = { heading: string | null; items: typeof members };
  const sections = useMemo<MemberSection[]>(() => {
    if (!members) return [];
    const q = search.trim().toLowerCase();
    if (q) {
      const results = members
        .filter((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q))
        .sort((a, b) => {
          const aFirst = a.firstName.toLowerCase().startsWith(q) ? 0 : 1;
          const bFirst = b.firstName.toLowerCase().startsWith(q) ? 0 : 1;
          return aFirst - bFirst;
        });
      return [{ heading: null, items: results }];
    }
    const sorted = [...members];
    if (sortMode === "az") {
      sorted.sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      );
      return [{ heading: null, items: sorted }];
    }
    if (sortMode === "za") {
      sorted.sort((a, b) =>
        `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`)
      );
      return [{ heading: null, items: sorted }];
    }
    if (sortMode === "side") {
      const myLastName = (user?.lastName ?? "").toLowerCase().trim();
      const mySide = sorted
        .filter((m) => m.lastName.toLowerCase().trim() === myLastName)
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
      const otherSide = sorted
        .filter((m) => m.lastName.toLowerCase().trim() !== myLastName)
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
      // Detect spouse's last name from in-law labels as a section heading, fallback to generic
      const spouseLastNames = [
        ...new Set(otherSide.map((m) => m.lastName).filter(Boolean)),
      ];
      const otherHeading =
        spouseLastNames.length === 1
          ? `${spouseLastNames[0]} Family`
          : spouseLastNames.length > 1
          ? `${spouseLastNames[0]} & More`
          : "Spouse's Family";
      return [
        { heading: `${user?.lastName ?? "Your"} Family`, items: mySide },
        { heading: otherHeading, items: otherSide },
      ].filter((s) => s.items && s.items.length > 0);
    }
    // Default: added order (createdAt ascending)
    sorted.sort(
      (a, b) => new Date((a as any).createdAt).getTime() - new Date((b as any).createdAt).getTime()
    );
    return [{ heading: null, items: sorted }];
  }, [members, sortMode, user?.lastName, search]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {user?.isAdmin && user.familyUnit?.id && <SharedInviteBanner unitId={user.familyUnit.id} />}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Family Directory</h1>
          <p className="text-muted-foreground mt-1">Manage the members in your family unit.</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 w-full sm:w-48 rounded-full text-sm border-border"
              />
            </div>
            {/* Sort control */}
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as typeof sortMode)}>
              <SelectTrigger className="w-32 sm:w-44 h-9 text-sm rounded-full border-border shrink-0">
                <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="added">Date added</SelectItem>
                <SelectItem value="az">A → Z</SelectItem>
                <SelectItem value="za">Z → A</SelectItem>
                <SelectItem value="side">By family side</SelectItem>
              </SelectContent>
            </Select>
          </div>

        {user?.isAdmin && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full shadow-sm whitespace-nowrap w-full sm:w-auto">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-serif text-2xl">Add Family Member</DialogTitle>
                <DialogDescription>
                  Add a member to your directory. You can invite them to claim their profile later.
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Jane" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Smith" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="relationshipLabel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Relationship</FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            // Clear parent if not a grandchild role
                            if (!["Grandson", "Granddaughter"].includes(val)) {
                              form.setValue("parentPersonId", null);
                            }
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select relationship..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent position="popper" className="max-h-64 overflow-y-auto">
                            {RELATIONSHIP_OPTIONS.map((group) => (
                              <SelectGroup key={group.group}>
                                <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  {group.group}
                                </SelectLabel>
                                {group.options.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Parent picker — shown for grandchild roles */}
                  {isGrandchildRole && parentCandidates.length > 0 && (
                    <FormField
                      control={form.control}
                      name="parentPersonId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Child of</FormLabel>
                          <Select
                            onValueChange={(val) => field.onChange(val === "none" ? null : val)}
                            value={field.value ?? "none"}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select parent..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Not specified</SelectItem>
                              {parentCandidates.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.firstName} {p.lastName} ({p.relationshipLabel})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <Button
                    type="submit"
                    className="w-full mt-4"
                    disabled={addMemberMutation.isPending}
                  >
                    {addMemberMutation.isPending ? "Adding..." : "Add Member"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
        </div>{/* end sort+actions row */}
      </div>

      <div className="space-y-6">
        {isLoading
          ? <div className="grid gap-4">{Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border-none shadow-sm">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                  </div>
                </CardContent>
              </Card>
            ))}</div>
          : sections.map((section, si) => (
            <div key={si} className="space-y-3">
              {section.heading && (
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1">
                  {section.heading}
                </h2>
              )}
              <div className="grid gap-3">
              {(section.items ?? []).map((member) => (
              <Card
                key={member.id}
                className="border-none shadow-sm bg-card hover:bg-secondary/20 transition-colors group overflow-hidden"
              >
                <CardContent className="p-0">
                  <div className="flex items-center p-4">
                    <Link href={`/members/${member.id}`}>
                      <div className="flex-1 flex items-center gap-4 cursor-pointer">
                        <Avatar className="h-14 w-14 border-2 border-background shadow-sm">
                          <AvatarImage src={member.photoUrl || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-medium text-lg">
                            {member.firstName[0]}{member.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-lg">
                              {member.firstName} {member.lastName}
                            </h3>
                            {member.claimed ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100 border-none font-normal text-xs px-2 py-0 h-5">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Claimed
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground font-normal text-xs px-2 py-0 h-5">
                                Unclaimed
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {member.relationshipLabel}
                            {user?.isAdmin && !member.birthday && (
                              <span className="ml-2 text-xs text-amber-600/80">· No birthday</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </Link>

                    <div className="flex items-center gap-3">
                      {!member.claimed && user?.isAdmin &&
                        (inviteTokenMap[member.id] ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(inviteTokenMap[member.id])}
                            className="text-xs hidden sm:flex"
                          >
                            <Copy className="w-3 h-3 mr-2" /> Copy Link
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleGenerateInvite(member.id)}
                            disabled={generateInviteMutation.isPending}
                            className="text-xs hidden sm:flex bg-accent/10 text-accent hover:bg-accent/20 border-none"
                          >
                            <LinkIcon className="w-3 h-3 mr-2" /> Invite
                          </Button>
                        ))}

                      {/* Admin-only: preview tree from this member's perspective */}
                      {user?.isAdmin && (
                        <Link href={`/tree?viewAs=${member.id}`} title={`Preview tree as ${member.firstName}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-primary"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                      )}

                      <Link href={`/members/${member.id}`}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground group-hover:text-primary"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {!member.claimed && user?.isAdmin && (
                    <div className="sm:hidden px-4 pb-4 pt-1">
                      {inviteTokenMap[member.id] ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(inviteTokenMap[member.id])}
                          className="w-full text-xs"
                        >
                          <Copy className="w-3 h-3 mr-2" /> Copy Link
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleGenerateInvite(member.id)}
                          disabled={generateInviteMutation.isPending}
                          className="w-full text-xs bg-accent/10 text-accent hover:bg-accent/20 border-none"
                        >
                          <LinkIcon className="w-3 h-3 mr-2" /> Generate Invite Link
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
              </div>{/* end grid */}
            </div>
          ))}

        {members?.length === 0 && (
          <div className="text-center py-12 px-4 rounded-2xl border border-dashed bg-[#FAF7F2]">
            <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mx-auto mb-4 text-muted-foreground">
              <Users className="w-8 h-8" />
            </div>
            <h3 className="font-serif text-xl font-semibold mb-2">No members yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Start building your family directory by adding members. You can invite them to claim their profile later.
            </p>
            <Button onClick={() => setIsAddOpen(true)} className="rounded-full shadow-sm">
              <UserPlus className="w-4 h-4 mr-2" />
              Add First Member
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Shared invite banner — Phase 5
// Surfaces the family's shareable link at the top of the directory so admins
// don't have to dig into Settings. Per-profile invite buttons (below) stay
// as a secondary action for the cases where you want a pre-bound link.
// ──────────────────────────────────────────────────────────────────────────
function SharedInviteBanner({ unitId }: { unitId: string }) {
  const { toast } = useToast();
  const [active, setActive] = useState<{ token: string; url: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch(`/api/family-units/${unitId}/invite-tokens`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("oliveToken") ?? ""}` },
      });
      if (cancelled) return;
      if (r.ok) {
        const data = (await r.json()) as { active: { token: string; url: string } | null };
        setActive(data.active);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [unitId]);

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
    } catch { /* no-op */ }
  };

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Family invite link</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Share this once. Anyone in the family can claim their profile — you approve each one.
          </p>
        </div>
        {loading ? null : active ? (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <code className="hidden sm:block flex-1 truncate font-mono text-xs px-3 py-1.5 rounded-md bg-background border border-border/60 max-w-xs">
              {active.url}
            </code>
            <Button size="sm" onClick={copy} className="rounded-full shrink-0">
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={regenerate}
              disabled={working}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              title="Regenerate (invalidates the old link)"
            >
              {working ? "…" : "↻"}
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={regenerate} disabled={working} className="rounded-full shrink-0">
            {working ? "Creating…" : "Create invite link"}
          </Button>
        )}
      </div>
    </div>
  );
}
