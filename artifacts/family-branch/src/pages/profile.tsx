import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useGetPerson, getGetPersonQueryKey, useUpdatePerson } from "@workspace/api-client-react";
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
} from "lucide-react";

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

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  const content = (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 w-8 h-8 rounded-full bg-primary/8 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="hover:bg-secondary/30 rounded-lg px-2 -mx-2 transition-colors block">
        {content}
      </a>
    );
  }
  return <div className="px-2 -mx-2">{content}</div>;
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.73a4.85 4.85 0 0 1-1.01-.04z" />
    </svg>
  );
}

function formatAddress(person: any) {
  const parts = [
    person.addressLine1,
    person.addressCity,
    person.addressState,
    person.addressZip,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function formatBirthday(birthday: string | null | undefined, showYear: boolean) {
  if (!birthday) return null;
  const d = new Date(birthday);
  if (showYear) {
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

// ─── Read-only profile view ──────────────────────────────────────────────────

function ProfileView({ person, onEdit, canEdit }: { person: any; onEdit: () => void; canEdit: boolean }) {
  const address = formatAddress(person);
  const birthday = formatBirthday(person.birthday, person.showBirthYear);
  const mapsHref = address
    ? `https://maps.google.com/?q=${encodeURIComponent(address)}`
    : undefined;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header card */}
      <Card className="border-none shadow-sm overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary/20 to-accent/20" />
        <CardContent className="px-6 pb-6 pt-0">
          <div className="flex items-end justify-between -mt-10 mb-4">
            <Avatar className="w-20 h-20 border-4 border-background shadow-md">
              <AvatarImage src={person.photoUrl || undefined} />
              <AvatarFallback className="text-3xl bg-primary/10 text-primary font-serif">
                {person.firstName[0]}{person.lastName[0]}
              </AvatarFallback>
            </Avatar>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={onEdit} className="rounded-full">
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
              </Button>
            )}
          </div>
          <h2 className="text-2xl font-serif font-bold text-foreground">
            {person.firstName} {person.lastName}
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">{person.relationshipLabel}</p>
          {birthday && (
            <p className="text-muted-foreground text-sm mt-1">Birthday: {birthday}</p>
          )}
        </CardContent>
      </Card>

      {/* Contact details */}
      {(person.phone || person.email || address) && (
        <Card className="border-none shadow-sm">
          <CardContent className="px-6 py-4">
            <h3 className="font-serif text-base font-semibold text-foreground mb-1 pb-2 border-b">
              Contact
            </h3>
            <div className="divide-y divide-border/50">
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

      {/* Social links */}
      {(person.instagram || person.facebook || person.tiktok || person.linkedin || person.otherSocial) && (
        <Card className="border-none shadow-sm">
          <CardContent className="px-6 py-4">
            <h3 className="font-serif text-base font-semibold text-foreground mb-1 pb-2 border-b">
              Social
            </h3>
            <div className="divide-y divide-border/50">
              <ContactRow
                icon={Instagram}
                label="Instagram"
                value={person.instagram ? `@${person.instagram.replace(/^@/, "")}` : null}
                href={person.instagram ? `https://instagram.com/${person.instagram.replace(/^@/, "")}` : undefined}
              />
              <ContactRow
                icon={Facebook}
                label="Facebook"
                value={person.facebook}
                href={person.facebook ? `https://facebook.com/${person.facebook}` : undefined}
              />
              <ContactRow
                icon={TikTokIcon}
                label="TikTok"
                value={person.tiktok ? `@${person.tiktok.replace(/^@/, "")}` : null}
                href={person.tiktok ? `https://tiktok.com/@${person.tiktok.replace(/^@/, "")}` : undefined}
              />
              <ContactRow
                icon={Linkedin}
                label="LinkedIn"
                value={person.linkedin}
                href={person.linkedin ? `https://linkedin.com/in/${person.linkedin}` : undefined}
              />
              <ContactRow
                icon={LinkIcon}
                label="Other"
                value={person.otherSocial}
                href={person.otherSocial?.startsWith("http") ? person.otherSocial : undefined}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {!person.phone && !person.email && !address &&
        !person.instagram && !person.facebook && !person.tiktok &&
        !person.linkedin && !person.otherSocial && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No contact details added yet.
          {canEdit && (
            <button onClick={onEdit} className="ml-1 underline text-primary">
              Add some.
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Edit form ───────────────────────────────────────────────────────────────

function ProfileEditForm({ person, targetId, onCancel }: { person: any; targetId: string; onCancel: () => void }) {
  const { toast } = useToast();
  const updateMutation = useUpdatePerson();

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: person?.firstName || "",
      lastName: person?.lastName || "",
      relationshipLabel: person?.relationshipLabel || "",
      phone: person?.phone || "",
      email: person?.email || "",
      addressLine1: person?.addressLine1 || "",
      addressCity: person?.addressCity || "",
      addressState: person?.addressState || "",
      addressZip: person?.addressZip || "",
      addressCountry: person?.addressCountry || "",
      birthday: person?.birthday ? person.birthday.split("T")[0] : "",
      showBirthYear: person?.showBirthYear ?? false,
      instagram: person?.instagram || "",
      facebook: person?.facebook || "",
      tiktok: person?.tiktok || "",
      linkedin: person?.linkedin || "",
      otherSocial: person?.otherSocial || "",
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
          toast({ variant: "destructive", title: "Update failed", description: error?.message });
        },
      }
    );
  };

  const Field = ({
    name,
    label,
    type = "text",
    placeholder,
  }: {
    name: keyof ProfileForm;
    label: string;
    type?: string;
    placeholder?: string;
  }) => (
    <FormField
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
  );

  return (
    <div className="max-w-2xl mx-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

          <section className="space-y-4">
            <h3 className="font-serif text-lg font-semibold border-b pb-2">Basic Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field name="firstName" label="First Name" />
              <Field name="lastName" label="Last Name" />
              <Field name="relationshipLabel" label="Relationship Role" />
              <Field name="birthday" label="Birthday" type="date" />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="font-serif text-lg font-semibold border-b pb-2">Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field name="phone" label="Phone" type="tel" placeholder="+1 (555) 000-0000" />
              <Field name="email" label="Email" type="email" placeholder="email@example.com" />
            </div>
            <Field name="addressLine1" label="Street Address" placeholder="123 Main St" />
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
              <Field name="addressState" label="State" />
              <Field name="addressZip" label="ZIP" />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="font-serif text-lg font-semibold border-b pb-2">Social</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field name="instagram" label="Instagram" placeholder="username" />
              <Field name="facebook" label="Facebook" placeholder="username or profile URL" />
              <Field name="tiktok" label="TikTok" placeholder="username" />
              <Field name="linkedin" label="LinkedIn" placeholder="username" />
              <Field name="otherSocial" label="Other Link" placeholder="https://..." />
            </div>
          </section>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={updateMutation.isPending} className="flex-1 md:flex-none md:w-32">
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
  const { personId } = useParams<{ personId?: string }>();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);

  const targetId = personId || user?.id;
  const isOwnProfile = user?.id === targetId;
  const canEdit = isOwnProfile || !!user?.isAdmin;

  const { data: person, isLoading } = useGetPerson(targetId || "", {
    query: {
      enabled: !!targetId,
      queryKey: getGetPersonQueryKey(targetId || ""),
    },
  });

  if (isLoading || !person) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  const backHref = personId ? "/members" : "/dashboard";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
        <ProfileView
          person={person}
          canEdit={canEdit}
          onEdit={() => setEditing(true)}
        />
      )}
    </div>
  );
}
