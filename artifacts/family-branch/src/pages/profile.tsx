import { useState } from "react";
import { Link, useParams } from "wouter";
import { useAuth } from "@/lib/auth";
import { useGetPerson, getGetPersonQueryKey, useUpdatePerson, useDeletePerson } from "@workspace/api-client-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Save } from "lucide-react";

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
});

type ProfileForm = z.infer<typeof profileSchema>;

export default function Profile() {
  const { personId } = useParams<{ personId?: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const targetId = personId || user?.id;
  const isOwnProfile = user?.id === targetId;

  const { data: person, isLoading } = useGetPerson(targetId || "", {
    query: {
      enabled: !!targetId,
      queryKey: getGetPersonQueryKey(targetId || "")
    }
  });

  const updateMutation = useUpdatePerson();
  const deleteMutation = useDeletePerson();

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: {
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
      birthday: person?.birthday ? person.birthday.split('T')[0] : "",
      showBirthYear: person?.showBirthYear ?? false,
    },
  });

  const onSubmit = (data: ProfileForm) => {
    if (!targetId) return;
    
    // Clean up empty strings to null for optional fields
    const cleanedData = {
      ...data,
      phone: data.phone || null,
      email: data.email || null,
      addressLine1: data.addressLine1 || null,
      addressCity: data.addressCity || null,
      addressState: data.addressState || null,
      addressZip: data.addressZip || null,
      addressCountry: data.addressCountry || null,
      birthday: data.birthday ? new Date(data.birthday).toISOString() : null,
    };

    updateMutation.mutate({ personId: targetId, data: cleanedData }, {
      onSuccess: () => {
        toast({
          title: "Profile updated",
          description: "Changes have been saved successfully.",
        });
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: error?.message || "Could not update profile.",
        });
      }
    });
  };

  if (isLoading || !person) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-32 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Only admin can edit others, or user can edit themselves
  const canEdit = isOwnProfile || user?.isAdmin;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        {personId && (
          <Link href="/members">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
        )}
        <h1 className="text-3xl font-serif font-bold text-foreground">
          {isOwnProfile ? "Your Profile" : `${person.firstName}'s Profile`}
        </h1>
      </div>

      <Card className="bg-card shadow-sm border-none">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex flex-col items-center gap-4">
              <Avatar className="w-32 h-32 border-4 border-background shadow-md">
                <AvatarImage src={person.photoUrl || undefined} />
                <AvatarFallback className="text-4xl bg-primary/10 text-primary font-serif">
                  {person.firstName[0]}{person.lastName[0]}
                </AvatarFallback>
              </Avatar>
              {canEdit && (
                <Button variant="outline" size="sm" className="w-full">
                  Change Photo
                </Button>
              )}
            </div>

            <div className="flex-1 w-full">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  
                  <div className="space-y-4">
                    <h3 className="font-serif text-xl font-semibold border-b pb-2">Basic Info</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input {...field} disabled={!canEdit} className="bg-background" />
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
                              <Input {...field} disabled={!canEdit} className="bg-background" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="relationshipLabel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Relationship Role</FormLabel>
                            <FormControl>
                              <Input {...field} disabled={!canEdit} className="bg-background" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="birthday"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Birthday</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} value={field.value ?? ""} disabled={!canEdit} className="bg-background" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4">
                    <h3 className="font-serif text-xl font-semibold border-b pb-2">Contact Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" {...field} value={field.value ?? ""} disabled={!canEdit} className="bg-background" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone Number</FormLabel>
                            <FormControl>
                              <Input type="tel" {...field} value={field.value ?? ""} disabled={!canEdit} className="bg-background" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4">
                    <h3 className="font-serif text-xl font-semibold border-b pb-2">Address</h3>
                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={form.control}
                        name="addressLine1"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Street Address</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ""} disabled={!canEdit} className="bg-background" />
                            </FormControl>
                            <FormMessage />
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
                                <Input {...field} value={field.value ?? ""} disabled={!canEdit} className="bg-background" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="addressState"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>State/Province</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value ?? ""} disabled={!canEdit} className="bg-background" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="addressZip"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ZIP/Postal Code</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value ?? ""} disabled={!canEdit} className="bg-background" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="pt-6 flex gap-4">
                      <Button type="submit" disabled={updateMutation.isPending} className="flex-1 md:flex-none md:w-32">
                        <Save className="w-4 h-4 mr-2" />
                        {updateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  )}
                </form>
              </Form>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
