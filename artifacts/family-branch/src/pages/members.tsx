import { useState } from "react";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, CheckCircle2, ChevronRight, Copy, Link as LinkIcon, Users } from "lucide-react";
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
  { group: "Spouses & Partners", options: ["Mom", "Dad", "Wife", "Husband", "Partner", "Spouse"] },
  { group: "Children", options: ["Son", "Daughter", "Child", "Stepson", "Stepdaughter"] },
  { group: "Grandchildren", options: ["Grandson", "Granddaughter", "Grandchild"] },
  { group: "Siblings", options: ["Brother", "Sister", "Sibling"] },
  { group: "Extended Family", options: ["Uncle", "Aunt", "Nephew", "Niece", "Cousin"] },
  { group: "Grandparents", options: ["Grandma", "Grandpa", "Grandmother", "Grandfather", "Nana", "Papa"] },
  { group: "Other", options: ["In-Law", "Stepparent", "Guardian", "Other"] },
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
  const isGrandchildRole = ["Grandson", "Granddaughter", "Grandchild"].includes(selectedRole);

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

  // Members eligible to be a "parent" in the tree (adult roles)
  const parentCandidates = (members || []).filter((m) =>
    ["Mom", "Dad", "Son", "Daughter", "Child", "Stepson", "Stepdaughter"].includes(m.relationshipLabel)
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Family Directory</h1>
          <p className="text-muted-foreground mt-1">Manage the members in your family unit.</p>
        </div>

        {user?.isAdmin && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full shadow-sm">
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
                            if (!["Grandson", "Granddaughter", "Grandchild"].includes(val)) {
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
                          <SelectContent>
                            {RELATIONSHIP_OPTIONS.map((group) => (
                              <div key={group.group}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  {group.group}
                                </div>
                                {group.options.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </div>
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
      </div>

      <div className="grid gap-4">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border-none shadow-sm">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                  </div>
                </CardContent>
              </Card>
            ))
          : members?.map((member) => (
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
                          <p className="text-sm text-muted-foreground">{member.relationshipLabel}</p>
                        </div>
                      </div>
                    </Link>

                    <div className="flex items-center gap-2">
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
