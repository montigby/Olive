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
import { PersonAvatar } from "@/components/PersonAvatar";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { UserPlus, CheckCircle2, ChevronRight, Copy, Link as LinkIcon, Users, Eye, ArrowUpDown, Search, MoreVertical, ShieldCheck, ShieldPlus, ShieldMinus, Printer } from "lucide-react";
import { formatBirthdayDate } from "@/lib/birthday";
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
    options: ["Daughter", "Granddaughter", "Great-granddaughter", "Sister", "Half-sister", "Stepsister", "Sister-in-law", "Mother-in-law", "Aunt", "Niece", "Wife", "Mom", "Grandma", "Nana", "Stepdaughter"],
  },
  {
    group: "Men",
    options: ["Son", "Grandson", "Great-grandson", "Brother", "Half-brother", "Stepbrother", "Brother-in-law", "Father-in-law", "Uncle", "Nephew", "Husband", "Dad", "Grandpa", "Papa", "Stepson"],
  },
  {
    group: "Other",
    options: ["Partner", "Spouse", "Cousin", "Stepparent", "Guardian", "Other"],
  },
];

const ALL_ROLES = RELATIONSHIP_OPTIONS.flatMap((g) => g.options);

// Roles where the new person hangs off a specific existing member rather than
// the admin directly -- the dialog needs a second picker so
// syncPersonToRelationshipLayer (artifacts/api-server/src/lib/syncRelationship.ts)
// gets a parentPersonId and can create a real graph edge instead of leaving
// the person a graph orphan (see suggestions_shortlist.md item #26).
const GRANDCHILD_ROLES = ["Grandson", "Granddaughter"];
const GREAT_GRANDCHILD_ROLES = ["Great-grandson", "Great-granddaughter"];
const NIECE_NEPHEW_ROLES = ["Niece", "Nephew"];
const SIBLING_IN_LAW_ROLES = ["Brother-in-law", "Sister-in-law"];
const COUSIN_ROLES = ["Cousin"];
const IN_LAW_PARENT_ROLES = ["Mother-in-law", "Father-in-law"];
const PARENT_PICKER_ROLES = [
  ...GRANDCHILD_ROLES,
  ...GREAT_GRANDCHILD_ROLES,
  ...NIECE_NEPHEW_ROLES,
  ...SIBLING_IN_LAW_ROLES,
  ...COUSIN_ROLES,
  ...IN_LAW_PARENT_ROLES,
];

// Auto-default the new Gender field from which group a relationship role
// was picked from (e.g. "Sister" -> Female) -- still freely editable, since
// the "Other" group (Partner, Cousin, Guardian, ...) doesn't imply a gender.
const GENDER_BY_ROLE: Record<string, "male" | "female"> = Object.fromEntries([
  ...RELATIONSHIP_OPTIONS.find((g) => g.group === "Women")!.options.map((r) => [r, "female"] as const),
  ...RELATIONSHIP_OPTIONS.find((g) => g.group === "Men")!.options.map((r) => [r, "male"] as const),
]);

const addMemberSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  relationshipLabel: z.string().min(1, "Please select a relationship"),
  gender: z.enum(["male", "female"]).nullable().optional(),
  parentPersonId: z.string().nullable().optional(),
});

type AddMemberForm = z.infer<typeof addMemberSchema>;

export default function Members() {
  const { user } = useAuth();
  const unitId = user?.familyUnit.id || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Deep link from elsewhere in the app (e.g. the dashboard's "Add Family
  // Member" button) straight into the add-member flow, instead of just
  // landing on the directory and leaving the user to find the button.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("add") === "1") {
      setIsAddOpen(true);
      window.history.replaceState(null, "", "/members");
    }
  }, []);
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
      gender: null,
      parentPersonId: null,
    },
  });

  const selectedRole = form.watch("relationshipLabel");
  const needsParentPicker = PARENT_PICKER_ROLES.includes(selectedRole);
  const isSiblingInLawRole = SIBLING_IN_LAW_ROLES.includes(selectedRole);
  const isInLawParentRole = IN_LAW_PARENT_ROLES.includes(selectedRole);
  const parentPickerLabel = isSiblingInLawRole ? "Married to" : isInLawParentRole ? "Parent of" : "Child of";
  const parentPickerPlaceholder = isSiblingInLawRole
    ? "Select spouse's sibling..."
    : isInLawParentRole
    ? "Select your spouse..."
    : "Select parent...";

  const onSubmit = (data: AddMemberForm) => {
    addMemberMutation.mutate(
      {
        unitId,
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          relationshipLabel: data.relationshipLabel,
          gender: data.gender || undefined,
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

  const [togglingAdminId, setTogglingAdminId] = useState<string | null>(null);
  // Confirmation gate before granting/revoking admin access -- this is a
  // high-trust action (admins can edit anyone's profile and manage other
  // admins), so it shouldn't fire from a single stray click in a menu.
  const [adminAction, setAdminAction] = useState<{ id: string; name: string; nextIsAdmin: boolean } | null>(null);

  const handleToggleAdmin = async (personId: string, nextIsAdmin: boolean) => {
    setTogglingAdminId(personId);
    try {
      const token = localStorage.getItem("oliveToken");
      const res = await fetch(`/api/persons/${personId}/admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isAdmin: nextIsAdmin }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: nextIsAdmin ? "Couldn't make them an admin" : "Couldn't remove admin",
          description: body.message || "Please try again.",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: getListMembersQueryKey(unitId) });
      toast({ title: nextIsAdmin ? "Admin access granted" : "Admin access removed" });
    } catch {
      toast({ variant: "destructive", title: "Network error", description: "Please try again." });
    } finally {
      setTogglingAdminId(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard!" });
    } catch {
      toast({ variant: "destructive", title: "Failed to copy" });
    }
  };

  // Members eligible to be picked in the second "parent" dropdown -- who's
  // valid depends on which relationship role is selected above (a grandchild
  // hangs off the admin's own kids, a niece/nephew off a sibling or their
  // spouse, an in-law sibling's spouse off the sibling they married, a
  // great-grandchild off an existing grandchild, a cousin off an aunt/uncle,
  // and an in-law parent off the admin's own spouse).
  const parentCandidates = useMemo(() => {
    if (!members) return [];
    if (GRANDCHILD_ROLES.includes(selectedRole)) {
      return members.filter((m) => ["Son", "Daughter", "Stepson", "Stepdaughter"].includes(m.relationshipLabel));
    }
    if (GREAT_GRANDCHILD_ROLES.includes(selectedRole)) {
      return members.filter((m) => GRANDCHILD_ROLES.includes(m.relationshipLabel));
    }
    if (NIECE_NEPHEW_ROLES.includes(selectedRole)) {
      return members.filter((m) => ["Brother", "Sister", "Brother-in-law", "Sister-in-law"].includes(m.relationshipLabel));
    }
    if (SIBLING_IN_LAW_ROLES.includes(selectedRole)) {
      return members.filter((m) => ["Brother", "Sister"].includes(m.relationshipLabel));
    }
    if (COUSIN_ROLES.includes(selectedRole)) {
      return members.filter((m) => ["Aunt", "Uncle"].includes(m.relationshipLabel));
    }
    if (IN_LAW_PARENT_ROLES.includes(selectedRole)) {
      return members.filter((m) => ["Wife", "Husband", "Spouse", "Partner"].includes(m.relationshipLabel));
    }
    return [];
  }, [members, selectedRole]);

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
    <div className="print:hidden space-y-6">
      {user?.isAdmin && user.familyUnit?.id && <SharedInviteBanner unitId={user.familyUnit.id} />}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Family Directory</h1>
          <p className="text-muted-foreground mt-1">Manage the members in your family unit.</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-end gap-2">
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
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full border-border shrink-0"
              title="Print directory"
              onClick={() => window.print()}
            >
              <Printer className="w-3.5 h-3.5" />
            </Button>
          </div>

        {user?.isAdmin && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full shadow-sm whitespace-nowrap w-full sm:w-auto">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Family Member
              </Button>
            </DialogTrigger>
            <DialogContent
              className="sm:max-w-md"
              onOpenAutoFocus={(event) => {
                // Radix focuses the first field the instant the dialog mounts, before its
                // 200ms open animation settles -- on mobile this makes the keyboard's
                // scroll-into-view use mid-animation geometry and cover the field. Defer
                // focus until the animation is done instead.
                event.preventDefault();
                const container = event.target as HTMLElement | null;
                window.setTimeout(() => {
                  container?.querySelector<HTMLInputElement>("input")?.focus();
                }, 250);
              }}
            >
              <DialogHeader>
                <DialogTitle className="font-serif text-2xl">Add Family Member</DialogTitle>
                <DialogDescription>
                  Add a member to your directory. You can invite them to claim their profile later.
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                            // The candidate list depends on the role (see parentCandidates
                            // above), so any previous selection may no longer be valid --
                            // always reset it rather than trying to carry it over.
                            form.setValue("parentPersonId", null);
                            // Default gender from the role's group (Women/Men) --
                            // still freely editable below via the Gender field.
                            form.setValue("gender", GENDER_BY_ROLE[val] ?? null);
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

                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gender</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(val === "unspecified" ? null : val)}
                          value={field.value ?? "unspecified"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select gender..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="unspecified">Prefer not to say</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Parent picker — shown for grandchild, niece/nephew, and
                      in-law-sibling roles, which all need to know which
                      existing member they hang off of (see PARENT_PICKER_ROLES) */}
                  {needsParentPicker && parentCandidates.length > 0 && (
                    <FormField
                      control={form.control}
                      name="parentPersonId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{parentPickerLabel}</FormLabel>
                          <Select
                            onValueChange={(val) => field.onChange(val === "none" ? null : val)}
                            value={field.value ?? "none"}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={parentPickerPlaceholder} />
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
                        <PersonAvatar firstName={member.firstName} lastName={member.lastName} photoUrl={member.photoUrl} />
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
                            {member.isAdmin && (
                              <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/10 border-none font-normal text-xs px-2 py-0 h-5">
                                <ShieldCheck className="w-3 h-3 mr-1" /> Admin
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {member.viewerRelationshipLabel ?? member.relationshipLabel}
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

                      {/* Admin-only: grant/revoke admin access. Only claimed
                          profiles have an account to grant it to. Opens a
                          confirmation dialog (below, outside this loop) that
                          explains what admin access means before it takes effect. */}
                      {user?.isAdmin && member.claimed && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-primary"
                              disabled={togglingAdminId === member.id}
                              title="Admin access"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                setAdminAction({
                                  id: member.id,
                                  name: member.firstName,
                                  nextIsAdmin: !member.isAdmin,
                                })
                              }
                            >
                              {member.isAdmin ? (
                                <>
                                  <ShieldMinus className="w-4 h-4 mr-2" /> Revoke admin access
                                </>
                              ) : (
                                <>
                                  <ShieldPlus className="w-4 h-4 mr-2" /> Grant admin access
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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

      {/* Admin grant/revoke confirmation -- explains what the role means
          before it takes effect, since it's a high-trust action. */}
      <AlertDialog open={!!adminAction} onOpenChange={(open) => { if (!open) setAdminAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {adminAction?.nextIsAdmin
                ? `Make ${adminAction.name} an admin?`
                : `Remove admin access from ${adminAction?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {adminAction?.nextIsAdmin
                ? "Admins can edit anyone's profile, add or remove family members, and grant or revoke admin access for others. Only give this to someone you'd trust to help run the family directory."
                : "They'll no longer be able to edit other members' profiles, add or remove people, or manage who else has admin access. Their own profile isn't affected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                adminAction && !adminAction.nextIsAdmin
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              disabled={!!togglingAdminId}
              onClick={() => {
                if (!adminAction) return;
                void handleToggleAdmin(adminAction.id, adminAction.nextIsAdmin);
              }}
            >
              {adminAction?.nextIsAdmin ? "Make admin" : "Remove access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

      {/* Print-only view -- hidden on screen, shown only in the print
          stylesheet (see index.css). Built from the same tier-filtered
          `sections` data as the on-screen list, so it never shows a member
          more than their viewer-level privacy settings allow. */}
      <PrintableDirectory
        familyName={user?.lastName ? `${user.lastName} Family` : user?.familyUnit.unitName}
        sections={sections}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Printable directory — print-only, plain-text contact sheet
// ──────────────────────────────────────────────────────────────────────────
function PrintableDirectory({
  familyName,
  sections,
}: {
  familyName?: string;
  sections: { heading: string | null; items: any[] | undefined }[];
}) {
  return (
    <div className="hidden print:block print:text-black">
      <h1 className="text-2xl font-serif font-bold mb-1">{familyName || "Family Directory"}</h1>
      <p className="text-xs text-gray-500 mb-6">
        Printed {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </p>
      {sections.map((section, si) => (
        <div key={si} className="mb-6 break-inside-avoid">
          {section.heading && (
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-1 mb-2">
              {section.heading}
            </h2>
          )}
          <table className="w-full text-sm border-collapse">
            <tbody>
              {(section.items ?? []).map((member) => {
                const addressParts = [
                  member.addressLine1,
                  [member.addressCity, member.addressState].filter(Boolean).join(", "),
                  member.addressZip,
                ].filter(Boolean);
                return (
                  <tr key={member.id} className="border-b border-gray-200 align-top break-inside-avoid">
                    <td className="py-2 pr-4 font-semibold whitespace-nowrap">
                      {member.firstName} {member.lastName}
                      <div className="font-normal text-gray-500">
                        {member.viewerRelationshipLabel ?? member.relationshipLabel}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      {member.phone && <div>{member.phone}</div>}
                      {member.email && <div>{member.email}</div>}
                      {member.birthday && <div>{formatBirthdayDate(member.birthday)}</div>}
                    </td>
                    <td className="py-2">
                      {addressParts.length > 0 && <div>{addressParts.join(" · ")}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
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
