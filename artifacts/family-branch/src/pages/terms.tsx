import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, BookUser } from "lucide-react";
import { Button } from "@/components/ui/button";

const LAST_UPDATED = "July 22, 2026";

export default function Terms() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => setLocation("/")}
          aria-label="Back to landing page"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Link href="/">
          <div className="inline-flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
              <BookUser className="w-4 h-4" />
            </div>
            <span className="font-serif font-bold text-xl">Olive</span>
          </div>
        </Link>
      </header>

      <main className="flex-1 flex justify-center px-4 pb-24">
        <div className="w-full max-w-2xl">
          <h1 className="font-serif text-3xl md:text-4xl font-semibold mb-2 text-foreground">
            Terms of Service
          </h1>
          <p className="text-sm text-muted-foreground mb-10">Last updated {LAST_UPDATED}</p>

          <div className="space-y-9 text-foreground/90 leading-relaxed">
            <section className="space-y-2">
              <p>
                These terms cover your use of Olive, a private family directory and connection app. By creating
                a family or claiming a profile, you're agreeing to them. We've kept this in plain language — see
                our <Link href="/privacy"><span className="text-primary underline cursor-pointer">Privacy page</span></Link> for
                how we handle your family's data specifically.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">What Olive is for</h2>
              <p>
                Olive is a private space for a family to keep contact info, birthdays, relationships, and
                life events current, and to be reminded when something worth knowing changes. It isn't a public
                social network, and it isn't a substitute for professional, legal, or medical record-keeping.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">Your account and your family unit</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>You're responsible for keeping your login credentials secure and for activity that happens under your account.</li>
                <li>Family admins can add profiles for people who haven't joined yet, edit the family's information, and manage who has admin access. That's a position of trust — admin access should only go to someone you'd trust to handle other people's information responsibly.</li>
                <li>Whoever creates a profile for someone else is responsible for what's on it until that person claims their own account and takes it over.</li>
                <li>You can delete your own profile's information or your account at any time; family admins can remove a profile from a family unit.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">Profiles for children and other family members</h2>
              <p>
                A parent or guardian may add a profile for a minor in their family, and is responsible for that
                profile and for deciding what information belongs on it. Don't add a profile for someone outside
                your own family, or for an adult who hasn't agreed to be part of your family's directory.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">Acceptable use</h2>
              <p>Don't use Olive to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Add information about someone who hasn't consented to being part of your family's directory</li>
                <li>Impersonate another person, or claim a profile that isn't yours</li>
                <li>Attempt to access another family's data, or probe the app for security weaknesses without permission</li>
                <li>Upload content you don't have the right to share, or that's abusive, harassing, or illegal</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">Your content</h2>
              <p>
                You keep ownership of the information and photos you add to Olive. By adding them, you're giving
                us permission to store and display that content to the people in your family unit (and linked
                family units, where applicable) for the purpose of running the app. We don't use your family's
                content for advertising or sell it to third parties — see the Privacy page for the full detail.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">The AI assistant</h2>
              <p>
                Olive's AI chat assistant can add or update family information based on what you tell it.
                Review what it does before relying on it for anything sensitive, and don't share information in
                chat you wouldn't want processed by our AI provider to carry out your request.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">Service availability</h2>
              <p>
                We work to keep Olive available and your family's data accurate, but we don't guarantee
                uninterrupted access, and Olive is provided "as is" without warranties of any kind. We're not
                liable for indirect or consequential damages arising from your use of the app, to the extent
                the law allows us to limit that.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">Changes to these terms</h2>
              <p>
                If these terms change in a meaningful way, we'll update this page and change the date at the
                top. Continuing to use Olive after a change means you accept the updated terms.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">Questions</h2>
              <p>
                Reach out to whoever invited you to your family's Olive directory — they can put you in touch
                if you have a question about these terms.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
