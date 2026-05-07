import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  useGetPerson,
  getGetPersonQueryKey,
  useUpdatePerson,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Save,
  Phone,
  Mail,
  MapPin,
  Instagram,
  Facebook,
  Linkedin,
  Link as LinkIcon,
  Pencil,
  AlertCircle,
  Cake,
} from "lucide-react";

// ─── Schema ──────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  relationshipLabel: z.string().min(1, "Relationship label is required"),
  phone: z.string().nullable().optional(),
  email: z.string().email("Invalid email").nullable().optional().or(z.literal("")),
  addressLine1: z.string().nullable().optional(),
  addressCity: z.string().nullable().optional(),
  addressState: z.string().nullable().optional(),
  addressZip: z.string().nullable().optional(),
  addressCountry: z.string().nullable().optional(),
  birthday: z.string().nullable().optional(),
  showBirthYear: z.boolean(),
  instagram: z.string().nullable().optional(),
  facebook: z.string().nullable().optional(),
  tiktok: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  otherSocial: z.string().nullable().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAddress(person: any): string | null {
  const parts = [
    person.addressLine1,
    person.addressCity,
    person.addressState,
    person.addressZip,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function formatBirthday(birthday: string | null | undefined, showYear: boolean): string | null {
  if (!birthday) return null;
  try {
    const d = new Date(birthday);
    if (isNaN(d.getTime())) return null;
    return showYear
      ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  } catch {
    return null;
  }
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.73a4.85 4.85 0 0 1-1.01-.04z" />
    </svg>
  );
}

// ─── ContactRow ───────────────────────────────────────────────────────────────

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  href?: string;
}) {
  if (!value) return null;

  const inner = (
    <div className="flex items-start gap-3 py-3">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className="text-sm font-medium text-foreground break-all">{value}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:bg-muted/50 rounded-lg px-3 -mx-3 transition-colors"
      >
        {inner}
      </a>
    );
  }
  return <div className="px-3 -mx-3">{inner}</div>;
}

// ─── ProfileView ──────────────────────────────────────────────────────────────

function ProfileView({
  person,
  canEdit,
  onEdit,
}: {
  person: any;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const address = formatAddress(person);
  const birthday = formatBirthday(person.birthday, person.showBirthYear ?? false);
  const mapsHref = address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : undefined;

  const initials =
    ((person.firstName || " ")[0] + (person.lastName || " ")[0]).toUpperCase();

  const hasContact = !!(person.phone || person.email || address);
  const hasSocial = !!(
    person.instagram || person.facebook || person.tiktok || person.linkedin || person.otherSocial
  );

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header card */}
      <Card className="overflow-hidden border border-border shadow-sm">
        <div className="h-24 bg-gradient-to-r from-primary/15 via-primary/10 to-accent/15" />
        <CardContent className="px-6 pb-6 pt-0">
          <div className="flex items-end justify-between -mt-12 mb-4">
            <Avatar className="w-24 h-24 border-4 border-card shadow-md">
              <AvatarImage src={person.photoUrl || undefined} />
              <AvatarFallback className="text-3xl bg-primary/10 text-primary font-serif">
                {initials}
              </AvatarFallback>
            </Avatar>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={onEdit} className="rounded-full mb-1">
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Edit
              </Button>
            )}
          </div>
          <h2 className="text-2xl font-serif font-bold text-foreground leading-tight">
            {person.firstName} {person.lastName}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">{person.relationshipLabel}</p>
          {birthday && (
            <div className="flex items-center gap-1.5 mt-2">
              <Cake className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="text-sm text-muted-foreground">{birthday}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contact */}
      {hasContact && (
        <Card className="border border-border shadow-sm">
          <CardContent className="px-6 py-5">
            <h3 className="font-serif text-base font-semibold text-foreground border-b border-border pb-2 mb-1">
              Contact
            </h3>
            <div className="divide-y divide-border/60">
              <ContactRow
                icon={Phone}
                label="Phone"
                value={person.phone}
                href={person.phone ? `tel:${person.phone}` : undefined}
              />
              <ContactRow
                icon={Mail}
                label="Email"
                value={person.email}
                href={person.email ? `mailto:${person.email}` : undefined}
              />
              <ContactRow
                icon={MapPin}
                label="Address"
                value={address}
                href={mapsHref}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Social */}
      {hasSocial && (
        <Card className="border border-border shadow-sm">
          <CardContent className="px-6 py-5">
            <h3 className="font-serif text-base font-semibold text-foreground border-b border-border pb-2 mb-1">
              Social
            </h3>
            <div className="divide-y divide-border/60">
              <ContactRow
                icon={Instagram}
                label="Instagram"
                value={person.instagram ? `@${person.instagram.replace(/^@/, "")}` : null}
                href={
                  person.instagram
                    ? `https://instagram.com/${person.instagram.replace(/^@/, "")}`
                    : undefined
                }
              />
              <ContactRow
                icon={Facebook}
                label="Facebook"
                value={person.facebook}
                href={
                  person.facebook ? `https://facebook.com/${person.facebook}` : undefined
                }
              />
              <ContactRow
                icon={TikTokIcon}
                label="TikTok"
                value={person.tiktok ? `@${person.tiktok.replace(/^@/, "")}` : null}
                href={
                  person.tiktok
                    ? `https://tiktok.com/@${person.tiktok.replace(/^@/, "")}`
                    : undefined
                }
              />
              <ContactRow
                icon={Linkedin}
                label="LinkedIn"
                value={person.linkedin}
                href={
                  person.linkedin ? `https://linkedin.com/in/${person.linkedin}` : undefined
                }
              />
              <ContactRow
                icon={LinkIcon}
                label="Other"
                value={person.otherSocial}
                href={
                  person.otherSocial?.startsWith("http") ? person.otherSocial : undefined
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!hasContact && !hasSocial && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No contact details added yet.
          {canEdit && (
            <>
              {" "}
              <button onClick={onEdit} className="underline text-primary hover:opacity-80">
                Add some.
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ProfileEditForm ──────────────────────────────────────────────────────────

function ProfileEditForm({
  person,
  targetId,
  onCancel,
}: {
  person: any;
  targetId: string;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const updateMutation = useUpdatePerson();

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: person?.firstName ?? "",
      lastName: person?.lastName ?? "",
      relationshipLabel: person?.relationshipLabel ?? "",
      phone: person?.phone ?? "",
      email: person?.email ?? "",
      addressLine1: person?.addressLine1 ?? "",
      addressCity: person?.addressCity ?? "",
      addressState: person?.addressState ?? "",
      addressZip: person?.addressZip ?? "",
      addressCountry: person?.addressCountry ?? "",
      birthday: person?.birthday ? person.birthday.split("T")[0] : "",
      showBirthYear: person?.showBirthYear ?? false,
      instagram: person?.instagram ?? "",
      facebook: person?.facebook ?? "",
      tiktok: person?.tiktok ?? "",
      linkedin: person?.linkedin ?? "",
      otherSocial: person?.otherSocial ?? "",
    },
  });

  const onSubmit = (data: ProfileForm) => {
    const cleaned = {
      ...data,
      phone: data.phone || null,
      email: data.email || null,
      addressLine1: data.addressLine1 || null,
      addressCity: data.addressCity || null,
      addressState: data.addressState || null,
      addressZip: data.addressZip || null,
      addressCountry: data.addressCountry || null,
      birthday: data.birthday ? new Date(data.birthday).toISOString() : null,
      instagram: data.instagram || null,
      facebook: data.facebook || null,
      tiktok: data.tiktok || null,
      linkedin: data.linkedin || null,
      otherSocial: data.otherSocial || null,
    };

    updateMutation.mutate(
      { personId: targetId, data: cleaned },
      {
        onSuccess: () => {
          toast({ title: "Profile updated" });
          onCancel();
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Update failed",
            description: error?.message,
          });
        },
      }
    );
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Basic */}
          <section className="space-y-4">
            <h3 className="font-serif text-lg font-semibold border-b pb-2">Basic Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(["firstName", "lastName", "relationshipLabel"] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {name === "firstName" ? "First Name" : name === "lastName" ? "Last Name" : "Relationship Role"}
                      </FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} className="bg-background" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <FormField
                control={form.control}
                name="birthday"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Birthday</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} className="bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>

          {/* Contact */}
          <section className="space-y-4">
            <h3 className="font-serif text-lg font-semibold border-b pb-2">Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  { name: "phone", label: "Phone", type: "tel", placeholder: "+1 (555) 000-0000" },
                  { name: "email", label: "Email", type: "email", placeholder: "email@example.com" },
                ] as const
              ).map(({ name, label, type, placeholder }) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input
                          type={type}
                          placeholder={placeholder}
                          {...field}
                          value={(field.value as string) ?? ""}
                          className="bg-background"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <FormField
              control={form.control}
              name="addressLine1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="123 Main St"
                      {...field}
                      value={field.value ?? ""}
                      className="bg-background"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="addressCity"
                render={({ field }) => (
                  <FormItem className="col-span-2 md:col-span-1">
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className="bg-background" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="addressState"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className="bg-background" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="addressZip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className="bg-background" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </section>

          {/* Social */}
          <section className="space-y-4">
            <h3 className="font-serif text-lg font-semibold border-b pb-2">Social</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  { name: "instagram", label: "Instagram", placeholder: "username" },
                  { name: "facebook", label: "Facebook", placeholder: "username or URL" },
                  { name: "tiktok", label: "TikTok", placeholder: "username" },
                  { name: "linkedin", label: "LinkedIn", placeholder: "username" },
                  { name: "otherSocial", label: "Other Link", placeholder: "https://..." },
                ] as const
              ).map(({ name, label, placeholder }) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={placeholder}
                          {...field}
                          value={(field.value as string) ?? ""}
                          className="bg-background"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </section>

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex-1 md:flex-none md:w-32"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Profile() {
  // useParams is unreliable in Wouter v3 nested routes (outer /:path* swallows params).
  // Parse personId directly from the URL as the authoritative source.
  const [location] = useLocation();
  const { personId: paramPersonId } = useParams<{ personId?: string }>();
  const personIdFromUrl = location.match(/^\/members\/([^/]+)/)?.[1];
  const personId = personIdFromUrl || paramPersonId;

  const { user } = useAuth();
  const [editing, setEditing] = useState(false);

  const targetId = personId || user?.id;
  const isOwnProfile = !personId || user?.id === personId;
  const canEdit = isOwnProfile || !!user?.isAdmin;

  const {
    data: person,
    isLoading,
    isError,
  } = useGetPerson(targetId || "", {
    query: {
      enabled: !!targetId,
      queryKey: getGetPersonQueryKey(targetId || ""),
    },
  });

  const backHref = personId ? "/members" : "/dashboard";

  if (isLoading) {
    return (
      <div className="space-y-5 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Skeleton className="h-9 w-48" />
        </div>
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-36 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !person) {
    return (
      <div className="space-y-5 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-serif font-bold text-foreground">Profile</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <AlertCircle className="w-10 h-10 text-destructive/60" />
          <p className="font-medium">Could not load this profile.</p>
          <Link href={backHref}>
            <Button variant="outline" size="sm">Go back</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={backHref}>
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-3xl font-serif font-bold text-foreground">
          {isOwnProfile ? "Your Profile" : `${person.firstName}'s Profile`}
        </h1>
      </div>

      {editing ? (
        <ProfileEditForm
          person={person}
          targetId={targetId!}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <ProfileView person={person} canEdit={canEdit} onEdit={() => setEditing(true)} />
      )}
    </div>
  );
}
