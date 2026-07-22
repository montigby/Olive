import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, BookUser } from "lucide-react";
import { Button } from "@/components/ui/button";

const LAST_UPDATED = "July 10, 2026";

export default function Privacy() {
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
            Privacy at Olive
          </h1>
          <p className="text-sm text-muted-foreground mb-10">Last updated {LAST_UPDATED}</p>

          <div className="space-y-9 text-foreground/90 leading-relaxed">
            <section className="space-y-2">
              <p>
                Olive is built to be a private space for your family, not a public network. This page explains,
                in plain language, what we collect, who can see it, and where it goes.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">What we collect</h2>
              <p>
                Information you or your family members choose to add to a profile — name, birthday, contact
                info, address, social handles, life events, and photos where supported. We also keep basic
                account info (email, hashed password) and the family relationships you set up.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">Who can see it</h2>
              <p>
                Only people in your family unit, and family units you've explicitly linked (like a parent's or
                sibling's unit), can see profile information — never the public internet. Some fields, like
                birth year, have their own visibility toggle you control per profile. Olive doesn't have a
                public directory or search engine indexing of your family's data.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">How it's used</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Showing your family directory and tree to people in your family unit</li>
                <li>Sending birthday and life-event notifications by email</li>
                <li>Powering the AI chat assistant when you use it to add or update family info</li>
              </ul>
              <p>
                We don't use your family's information for advertising, and we don't sell it to third parties.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">Services we rely on</h2>
              <p>Olive is built on a small number of trusted providers who process data on our behalf:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Supabase</strong> — hosts the database where your family's information is stored</li>
                <li><strong>Vercel</strong> — hosts the app itself</li>
                <li><strong>Resend</strong> — sends birthday and notification emails on our behalf</li>
                <li>
                  <strong>OpenAI</strong> — powers the AI chat assistant. Messages you send to the assistant
                  are processed by OpenAI to carry out your request (e.g. "add my cousin Jake"). Don't share
                  anything in chat you wouldn't want handled by that request.
                </li>
              </ul>
              <p>None of these providers are permitted to use your family's data for their own purposes.</p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">Profiles for kids and family members who haven't joined yet</h2>
              <p>
                A parent, guardian, or family admin can create a profile for someone before they have their own
                account — that's how most families get started. Whoever created the profile is responsible for
                its contents until the person it belongs to claims their own account and takes it over.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">Your control over your data</h2>
              <p>
                You can edit or remove most of your own information at any time from your profile and account
                settings. Family admins can remove a profile from the family entirely. If you'd like help
                deleting your account or data and can't find the option in the app, contact us below.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">Changes to this page</h2>
              <p>
                If how we handle your family's data changes in a meaningful way, we'll update this page and
                change the date at the top.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">Questions</h2>
              <p>
                Reach out to whoever invited you to your family's Olive directory — they can put you in touch
                if you have a privacy question or need help with your data.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
