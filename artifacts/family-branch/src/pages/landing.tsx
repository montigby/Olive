import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  RefreshCw,
  Lock,
  Sparkles,
  TreePine,
  BookUser,
  Cake,
  Share2,
  Bell,
  NotebookPen,
  Instagram,
  Facebook,
  Twitter,
} from "lucide-react";

// ─── Brand palette (matches the app's theme tokens in index.css) ──
const BG = "#FAF8F5";
const GREEN = "#6B7A46";
const GREEN_DARK = "#57623A";
const GOLD = "#D6B370";
const TEXT = "#333333";

function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// A tasteful abstract placeholder standing in for real photography -- swap
// for actual family photos before public launch. `variant` just varies the
// gradient angle/shapes so the several image slots on the page don't look
// identical.
function PhotoPlaceholder({
  variant = "a",
  className = "",
}: {
  variant?: "a" | "b" | "c";
  className?: string;
}) {
  const gradients: Record<string, string> = {
    a: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DARK} 60%, ${GOLD} 130%)`,
    b: `linear-gradient(160deg, ${GOLD} 0%, ${GREEN} 70%)`,
    c: `linear-gradient(200deg, ${GREEN_DARK} 0%, ${GREEN} 55%, ${GOLD} 140%)`,
  };
  return (
    <div
      className={`relative overflow-hidden rounded-[2rem] shadow-lg ${className}`}
      style={{ background: gradients[variant] }}
      role="img"
      aria-label="Illustration of a family staying connected"
    >
      <div className="absolute inset-0 opacity-20">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full border-[16px] border-white" />
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full border-[16px] border-white translate-x-1/3 translate-y-1/3" />
      </div>
      <div className="relative flex items-center justify-center h-full">
        <svg width="88" height="88" viewBox="0 0 24 24" fill="none" className="opacity-90">
          <circle cx="7" cy="8" r="3" stroke="white" strokeWidth="1.4" />
          <circle cx="17" cy="8" r="3" stroke="white" strokeWidth="1.4" />
          <circle cx="12" cy="16" r="3.4" stroke="white" strokeWidth="1.4" />
          <path d="M9.2 10.2 L10.6 13.6 M14.8 10.2 L13.4 13.6" stroke="white" strokeWidth="1.2" />
        </svg>
      </div>
    </div>
  );
}

function ScrollLink({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        document.querySelector(to)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}

export default function Landing() {
  return (
    <div style={{ backgroundColor: BG, color: TEXT }} className="min-h-screen font-sans selection:bg-[#EEF1E7]">
      {/* ─── Nav ─────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 backdrop-blur-md border-b border-black/5"
        style={{ backgroundColor: `${BG}E6` }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: GREEN }}>
              <BookUser className="w-4 h-4" />
            </div>
            <span className="font-serif font-bold text-xl tracking-tight">Olive</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium" style={{ color: "#6B6560" }}>
            <ScrollLink to="#how-it-works" className="hover:opacity-70 transition-opacity">How it Works</ScrollLink>
            <ScrollLink to="#features" className="hover:opacity-70 transition-opacity">Features</ScrollLink>
            <ScrollLink to="#faq" className="hover:opacity-70 transition-opacity">FAQ</ScrollLink>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <span className="text-sm font-medium hover:opacity-70 transition-opacity cursor-pointer" style={{ color: "#6B6560" }}>
                Log In
              </span>
            </Link>
            <Link href="/register">
              <Button className="rounded-full px-5 text-white border-0" style={{ backgroundColor: GREEN }}>
                Create Directory
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ────────────────────────────────────────────────────── */}
      <section className="px-6 pt-16 md:pt-24 pb-16">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <FadeIn>
            <p className="text-sm font-semibold tracking-wide uppercase mb-4" style={{ color: GREEN }}>
              For families who want to stay close
            </p>
            <h1 className="font-serif text-4xl md:text-6xl font-medium leading-[1.1] mb-6">
              The Place Your Family's Memory Lives.
            </h1>
            <p className="text-lg md:text-xl leading-relaxed mb-8" style={{ color: "#5A5650" }}>
              Birthdays, phone numbers, addresses, relationships — kept current in one private
              place, with a reminder when it matters.
            </p>
            <Link href="/register">
              <Button className="h-12 rounded-full px-8 text-base text-white border-0" style={{ backgroundColor: GREEN }}>
                Create Your Family Directory
              </Button>
            </Link>
            <p className="text-sm mt-4" style={{ color: "#6B6560" }}>Free to get started. Takes less than 2 minutes.</p>
          </FadeIn>
          <FadeIn delay={0.15}>
            <PhotoPlaceholder variant="a" className="w-full aspect-square md:aspect-[4/5]" />
          </FadeIn>
        </div>
      </section>

      {/* ─── Trust ───────────────────────────────────────────────────── */}
      <section className="px-6 py-16 border-y border-black/5" style={{ backgroundColor: "#F3F0EA" }}>
        <div className="max-w-6xl mx-auto grid sm:grid-cols-3 gap-10 text-center">
          {[
            { icon: RefreshCw, title: "Always Current", body: "Everyone updates their own information." },
            { icon: Lock, title: "Private", body: "Only your family can see your family." },
            { icon: Sparkles, title: "Never Forgets", body: "Olive remembers so you don't have to." },
          ].map((item, i) => (
            <FadeIn key={item.title} delay={i * 0.1}>
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: "#EEF1E7" }}
              >
                <item.icon className="w-6 h-6" style={{ color: GREEN }} />
              </div>
              <h3 className="font-serif text-xl font-semibold mb-2">{item.title}</h3>
              <p style={{ color: "#5A5650" }}>{item.body}</p>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ─── Problem ─────────────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <h2 className="font-serif text-3xl md:text-5xl font-medium text-center mb-16">
              It's Never One Big Thing
            </h2>
          </FadeIn>
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="grid sm:grid-cols-1 gap-10 order-2 md:order-1">
              {[
                {
                  title: "You forget birthdays.",
                  body: "Life gets busy.",
                },
                {
                  title: "Phone numbers change.",
                  body: "Addresses change. Social media changes.",
                },
                {
                  title: "Grandkids grow up online.",
                  body: "Keeping up shouldn't require Facebook, Instagram, TikTok, and five group chats.",
                },
              ].map((item, i) => (
                <FadeIn key={item.title} delay={i * 0.1}>
                  <h3 className="font-serif text-2xl font-semibold mb-2">{item.title}</h3>
                  <p className="text-lg" style={{ color: "#5A5650" }}>{item.body}</p>
                </FadeIn>
              ))}
            </div>
            <FadeIn delay={0.2} className="order-1 md:order-2">
              <PhotoPlaceholder variant="b" className="w-full aspect-[4/5]" />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── Solution ────────────────────────────────────────────────── */}
      <section id="features" className="px-6 py-24" style={{ backgroundColor: "#F3F0EA" }}>
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <FadeIn>
            <PhoneMockup />
          </FadeIn>
          <FadeIn delay={0.15}>
            <h2 className="font-serif text-3xl md:text-5xl font-medium mb-6">Meet Olive</h2>
            <p className="text-lg leading-relaxed mb-10" style={{ color: "#5A5650" }}>
              One private place holds everyone's information. Olive keeps it current and tells
              you when something worth knowing changes.
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {[
                { icon: TreePine, label: "Family Tree" },
                { icon: BookUser, label: "Contact Directory" },
                { icon: Cake, label: "Birthdays" },
                { icon: Share2, label: "Social Accounts" },
                { icon: Bell, label: "AI Reminders" },
                { icon: NotebookPen, label: "Family Notes" },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#EEF1E7" }}>
                    <f.icon className="w-4.5 h-4.5" style={{ color: GREEN }} />
                  </div>
                  <span className="font-medium">{f.label}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── AI section ──────────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <FadeIn>
            <h2 className="font-serif text-3xl md:text-5xl font-medium mb-14">What Olive Remembers For You</h2>
          </FadeIn>
          <div className="flex flex-col gap-3 items-stretch text-left">
            {[
              "Emily's birthday is tomorrow.",
              "It's been six weeks since you've talked with Tyler.",
              "Ava just posted photos from her graduation.",
              "Josh and Sarah just welcomed a new baby.",
              "Miranda's anniversary is next week.",
            ].map((msg, i) => (
              <FadeIn key={msg} delay={i * 0.08}>
                <div
                  className="flex items-center gap-3 rounded-2xl px-5 py-3.5 text-[15px] leading-snug shadow-sm bg-white"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: GREEN }} />
                  {msg}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it Works ────────────────────────────────────────────── */}
      <section id="how-it-works" className="px-6 py-24" style={{ backgroundColor: "#F3F0EA" }}>
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <h2 className="font-serif text-3xl md:text-5xl font-medium text-center mb-16">How It Works</h2>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { n: "1", title: "Create your family.", body: "Set up your family unit in minutes." },
              { n: "2", title: "Invite everyone.", body: "Each person manages their own information." },
              { n: "3", title: "Everyone stays visible.", body: "New numbers, new addresses, new milestones — kept current automatically." },
            ].map((step, i) => (
              <FadeIn key={step.n} delay={i * 0.1}>
                <div className="bg-white rounded-3xl p-8 h-full shadow-sm">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center font-serif text-xl font-semibold mb-6 text-white"
                    style={{ backgroundColor: GREEN }}
                  >
                    {step.n}
                  </div>
                  <h3 className="font-serif text-2xl font-semibold mb-2">{step.title}</h3>
                  <p style={{ color: "#5A5650" }}>{step.body}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Future Vision ───────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <FadeIn>
            <h2 className="font-serif text-3xl md:text-5xl font-medium mb-12">What Olive Keeps Track Of</h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-left max-w-xl mx-auto">
              {[
                "Birthdays",
                "Anniversaries",
                "New babies",
                "Graduations",
                "Moves",
                "Phone numbers",
                "Addresses",
                "Big moments",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-lg">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs shrink-0"
                    style={{ backgroundColor: GOLD }}
                  >
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </FadeIn>
        </div>
      </section>

      {/* ─── Testimonials ────────────────────────────────────────────── */}
      <section className="px-6 py-24" style={{ backgroundColor: "#F3F0EA" }}>
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          {[
            "I finally know how to reach everyone.",
            "Mom calls our kids more because Olive reminds her.",
            "The whole family feels closer.",
          ].map((quote, i) => (
            <FadeIn key={quote} delay={i * 0.1}>
              <div className="bg-white rounded-3xl p-8 h-full shadow-sm">
                <p className="font-serif text-xl italic leading-relaxed">"{quote}"</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ─── FAQ ─────────────────────────────────────────────────────── */}
      <section id="faq" className="px-6 py-24">
        <div className="max-w-2xl mx-auto">
          <FadeIn>
            <h2 className="font-serif text-3xl md:text-5xl font-medium text-center mb-14">Questions</h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <Accordion type="single" collapsible className="w-full">
              {[
                {
                  q: "Is my family's information private?",
                  a: "Yes. Only the family members you invite can see your family's directory, and you control how much of your own profile different relatives can see.",
                },
                {
                  q: "Do my kids have to install another app?",
                  a: "No. Olive works right in the browser on any phone, tablet, or computer — no app store download required.",
                },
                {
                  q: "Can I print a family directory?",
                  a: "Not yet, but it's on our roadmap — we know how useful a printed copy is for the grandparents who'd rather not look at a screen.",
                },
                {
                  q: "Can I connect multiple generations?",
                  a: "Yes. You can link your family unit to your parents' or your kids' units, so everyone stays visible across the whole extended family.",
                },
                {
                  q: "Does Olive read my social media?",
                  a: "No. Olive never connects to or scrapes your social accounts — you simply share your own handles so family can find you.",
                },
                {
                  q: "Can I delete my information?",
                  a: "Yes, at any time. You're always in control of your own profile and can remove it whenever you'd like.",
                },
              ].map((item, i) => (
                <AccordionItem key={item.q} value={String(i)} className="border-black/10">
                  <AccordionTrigger className="text-left font-serif text-lg hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent style={{ color: "#5A5650" }}>{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </FadeIn>
        </div>
      </section>

      {/* ─── Final CTA ───────────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <PhotoPlaceholder variant="c" className="w-full h-56 md:h-72 mb-12" />
          </FadeIn>
          <FadeIn delay={0.1} className="text-center">
            <h2 className="font-serif text-3xl md:text-5xl font-medium mb-4">
              Stay Close to the People You Love.
            </h2>
            <p className="text-lg mb-10" style={{ color: "#5A5650" }}>
              Create your family's directory today — free to get started.
            </p>
            <Link href="/register">
              <Button className="h-12 rounded-full px-8 text-base text-white border-0" style={{ backgroundColor: GREEN }}>
                Create Your Family Directory
              </Button>
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <footer className="px-6 py-12 border-t border-black/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: GREEN }}>
              <BookUser className="w-3.5 h-3.5" />
            </div>
            <span className="font-serif font-bold text-lg">Olive</span>
          </div>
          <div className="flex items-center gap-6 text-sm" style={{ color: "#6B6560" }}>
            <Link href="/privacy"><span className="hover:opacity-70 cursor-pointer">Privacy</span></Link>
            <Link href="/terms"><span className="hover:opacity-70 cursor-pointer">Terms</span></Link>
            <span className="hover:opacity-70 cursor-pointer">Contact</span>
          </div>
          <div className="flex items-center gap-4" style={{ color: "#6B6560" }}>
            <Instagram className="w-4 h-4" />
            <Facebook className="w-4 h-4" />
            <Twitter className="w-4 h-4" />
          </div>
        </div>
        <p className="text-center text-sm mt-8" style={{ color: "#6B6560" }}>
          © {new Date().getFullYear()} Olive. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-64 select-none">
      <div className="rounded-[2.5rem] border-[10px] border-[#333333] bg-[#333333] shadow-2xl overflow-hidden">
        <div className="bg-white rounded-[1.75rem] overflow-hidden">
          <div className="px-4 pt-4 pb-3" style={{ backgroundColor: "#EEF1E7" }}>
            <p className="font-serif font-semibold text-sm">Family Directory</p>
          </div>
          <div className="p-3 flex flex-col gap-2">
            {[
              { name: "Grandma Rose", sub: "Grandmother" },
              { name: "Uncle Marcus", sub: "Uncle" },
              { name: "Emily", sub: "Niece" },
              { name: "Sam & Jordan", sub: "Cousins" },
            ].map((p) => (
              <div key={p.name} className="flex items-center gap-2.5 rounded-xl bg-[#FAF8F5] px-2.5 py-2">
                <div className="w-8 h-8 rounded-full shrink-0" style={{ backgroundColor: GOLD }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{p.name}</p>
                  <p className="text-[10px]" style={{ color: "#6B6560" }}>{p.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
