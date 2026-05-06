import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useClaimProfile, useGetInvite, getGetInviteQueryKey } from "@workspace/api-client-react";
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
import { BookUser } from "lucide-react";

const claimSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type ClaimForm = z.infer<typeof claimSchema>;

export default function InviteClaim() {
  const { token } = useParams<{ token: string }>();
  const { login: setAuthToken } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const claimMutation = useClaimProfile();

  const { data: invite, isLoading, error } = useGetInvite(token || "", {
    query: {
      enabled: !!token,
      queryKey: getGetInviteQueryKey(token || ""),
      retry: false
    }
  });

  const form = useForm<ClaimForm>({
    resolver: zodResolver(claimSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (data: ClaimForm) => {
    if (!token) return;
    
    claimMutation.mutate({ token, data }, {
      onSuccess: (response: any) => {
        if (response?.token) {
          setAuthToken(response.token);
          setLocation("/dashboard");
        }
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Claim failed",
          description: error?.message || "There was an error claiming your profile.",
        });
      }
    });
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
            <span className="text-2xl">!</span>
          </div>
          <h1 className="text-2xl font-serif font-bold">Invalid or Expired Invite</h1>
          <p className="text-muted-foreground">This invitation link is no longer valid. Please ask your family admin to send a new one.</p>
          <Link href="/">
            <Button variant="outline" className="mt-4">Return Home</Button>
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
          <div className="text-center mb-8">
            <h1 className="font-serif text-3xl font-semibold mb-2 text-foreground">Welcome to the family</h1>
            <p className="text-muted-foreground">
              {invite.unitName} is waiting for you. Claim your profile as {invite.firstName} {invite.lastName}.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="you@example.com" {...field} className="bg-background" />
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
                      <Input type="password" placeholder="••••••••" {...field} className="bg-background" />
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
                {claimMutation.isPending ? "Claiming..." : "Claim Profile"}
              </Button>
            </form>
          </Form>
        </div>
      </main>
    </div>
  );
}
