import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForgotPassword } from "@workspace/api-client-react";
import { Link } from "wouter";
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
import { BookUser, MailCheck } from "lucide-react";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  const forgotPasswordMutation = useForgotPassword();

  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = (data: ForgotPasswordForm) => {
    // The backend always returns the same generic message whether or not the
    // email is registered, and we show it unconditionally too -- never a
    // different UI for "found" vs "not found", to avoid leaking who has an
    // account. A network/validation error is the only thing that skips it.
    forgotPasswordMutation.mutate({ data });
  };

  const submitted = forgotPasswordMutation.isSuccess;

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
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <MailCheck className="w-6 h-6 text-primary" />
              </div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">Check your email</h1>
              <p className="text-muted-foreground">
                If that email is registered, a reset link has been sent. It'll expire in 1 hour.
              </p>
              <Link href="/login">
                <span className="text-primary font-medium hover:underline cursor-pointer">Back to sign in</span>
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="font-serif text-3xl font-semibold mb-2 text-foreground">Forgot password?</h1>
                <p className="text-muted-foreground">
                  Enter your email and we'll send you a link to reset it.
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

                  <Button
                    type="submit"
                    className="w-full h-11 text-base mt-2"
                    disabled={forgotPasswordMutation.isPending}
                  >
                    {forgotPasswordMutation.isPending ? "Sending..." : "Send reset link"}
                  </Button>
                </form>
              </Form>

              <div className="mt-8 text-center text-sm text-muted-foreground">
                Remembered it?{" "}
                <Link href="/login">
                  <span className="text-primary font-medium hover:underline cursor-pointer">Sign in</span>
                </Link>
              </div>
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
