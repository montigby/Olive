import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useResetPassword } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
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
import { BookUser, AlertCircle } from "lucide-react";

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const resetPasswordMutation = useResetPassword();

  // Wouter's route matching doesn't expose the query string, so read it
  // directly off window.location -- the same pattern used elsewhere in this
  // app (members.tsx, profile.tsx, tree.tsx) for one-off query params.
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token"),
    [],
  );

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = (data: ResetPasswordForm) => {
    if (!token) return;
    resetPasswordMutation.mutate(
      { data: { token, newPassword: data.password } },
      {
        onSuccess: () => {
          toast({
            title: "Password reset",
            description: "You can now sign in with your new password.",
          });
          setLocation("/login");
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Couldn't reset password",
            description: error?.message || "That reset link is invalid or has expired.",
          });
        },
      },
    );
  };

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
          {!token ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">Missing reset link</h1>
              <p className="text-muted-foreground">
                This page needs a reset token from your email link. Request a new one to continue.
              </p>
              <Link href="/forgot-password">
                <span className="text-primary font-medium hover:underline cursor-pointer">Request a new link</span>
              </Link>
            </div>
          ) : resetPasswordMutation.isError ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">Link invalid or expired</h1>
              <p className="text-muted-foreground">
                {(resetPasswordMutation.error as any)?.message ||
                  "This reset link is invalid or has expired. Request a new one to continue."}
              </p>
              <Link href="/forgot-password">
                <span className="text-primary font-medium hover:underline cursor-pointer">Request a new link</span>
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="font-serif text-3xl font-semibold mb-2 text-foreground">Set a new password</h1>
                <p className="text-muted-foreground">Choose a new password for your account.</p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} className="bg-background" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm new password</FormLabel>
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
                    disabled={resetPasswordMutation.isPending}
                  >
                    {resetPasswordMutation.isPending ? "Resetting..." : "Reset password"}
                  </Button>
                </form>
              </Form>
            </>
          )}
        </div>
      </main>

      <footer className="px-6 py-6 text-center">
        <Link href="/privacy">
          <span className="text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer">Privacy</span>
        </Link>
      </footer>
    </div>
  );
}
