/**
 * Post-invite welcome / home-feed screen.
 *
 * Shown immediately after a new member claims their invite so they
 * experience the product's core value (live family knowledge) before
 * being asked to fill in their own profile.
 *
 * Layout:
 *   Mobile  — single column: header → stats → birthdays → updates → completion
 *   Desktop — header spans full width; below: [birthdays 1.4fr | stats+updates+completion 1fr]
 */

import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Cake,
  ChevronRight,
  Leaf,
  Phone,
  Camera,
  Mail,
  MapPin,
  UserPlus,
  User,
  ArrowRight,
} from "lucide-react";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BirthdayEntry {
  memberId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  initials: string;
  birthMonth: number;
  birthDay: number;
  daysUntil: number;
  ageTurning: number | null;
  phone: string | null;
  email: string | null;
}

interface RecentUpdate {
  memberId: string;
  name: string;
  changeType: string;
  description: string;
  timestamp: string;
  avatarUrl: string | null;
  initials: string;
}

interface HomeFeed {
  member: {
    id: string;
    firstName: string;
    profileCompleteness: number;
    missingPriorityField: "phone" | "photo" | "email" | "birthday" | null;
  };
  family: { unitName: string };
  upcomingBirthdays: BirthdayEntry[];
  stats: { birthdaysThisMonth: number; newContactsCount: number };
  recentUpdates: RecentUpdate[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function relativeDateLabel(daysUntil: number, month: number, day: number): string {
  if (daysUntil === 0) return "Today! 🎂";
  if (daysUntil === 1) return "Tomorrow";
  if (daysUntil <= 7) return `In ${daysUntil} days`;
  return `${MONTH_ABBR[month - 1]} ${day}`;
}

function birthdaySubline(entry: BirthdayEntry): string {
  const date = relativeDateLabel(entry.daysUntil, entry.birthMonth, entry.birthDay);
  if (entry.ageTurning) return `Turns ${entry.ageTurning} · ${date}`;
  return `Birthday · ${date}`;
}

/** Option B hand-off: open SMS → email → nothing */
function onWish(entry: BirthdayEntry, toast: (opts: any) => void) {
  const msg = `Happy birthday, ${entry.firstName}! 🎂`;
  if (entry.phone) {
    window.open(`sms:${entry.phone}?body=${encodeURIComponent(msg)}`, "_self");
    return;
  }
  if (entry.email) {
    window.open(
      `mailto:${entry.email}?subject=${encodeURIComponent("Happy Birthday!")}&body=${encodeURIComponent(msg)}`,
      "_self",
    );
    return;
  }
  toast({ title: "No contact info", description: `We don't have ${entry.firstName}'s phone or email yet.` });
}

const UPDATE_ICON: Record<string, React.ElementType> = {
  joined: UserPlus,
  photo: Camera,
  phone: Phone,
  address: MapPin,
  profile: User,
};

const MISSING_FIELD_PROMPT: Record<string, string> = {
  phone: "Add your cell so family can reach you",
  photo: "Add a photo so family can recognize you",
  email: "Add your email address",
  birthday: "Add your birthday so family can celebrate you",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <Card className="bg-[#FAF7F2] border-none shadow-sm flex-1">
      <CardContent className="p-5 flex flex-col gap-1">
        <p className="text-[13px] font-medium text-muted-foreground leading-tight">{label}</p>
        <p className="text-[28px] font-semibold leading-none text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function BirthdayRow({ entry, index, onWishClick }: {
  entry: BirthdayEntry;
  index: number;
  onWishClick: (e: BirthdayEntry) => void;
}) {
  const isFirst = index === 0;
  return (
    <div className={`flex items-center gap-3 py-3 ${index > 0 ? "border-t border-border/50" : ""}`}>
      <Avatar className={`h-11 w-11 flex-shrink-0 ${isFirst ? "ring-2 ring-primary/40" : ""}`}>
        <AvatarImage src={entry.avatarUrl || undefined} />
        <AvatarFallback
          className={`text-sm font-semibold ${
            isFirst
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {entry.initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">
          {entry.firstName} {entry.lastName}
        </p>
        <p className={`text-xs mt-0.5 ${isFirst ? "text-primary font-medium" : "text-muted-foreground"}`}>
          {birthdaySubline(entry)}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="flex-shrink-0 h-8 text-xs rounded-full border-primary/30 text-primary hover:bg-primary/5"
        onClick={() => onWishClick(entry)}
      >
        Wish
      </Button>
    </div>
  );
}

function RecentUpdateRow({ item }: { item: RecentUpdate }) {
  const Icon = UPDATE_ICON[item.changeType] ?? User;
  const relTime = (() => {
    const ms = Date.now() - new Date(item.timestamp).getTime();
    const hrs = Math.floor(ms / (1000 * 60 * 60));
    if (hrs < 1) return "just now";
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  })();
  return (
    <Link href={`/members/${item.memberId}`}>
      <div className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/30 -mx-1 px-1 rounded-lg transition-colors">
        <div className="w-9 h-9 rounded-full bg-primary/8 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <p className="text-sm text-foreground flex-1 min-w-0 truncate">{item.description}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[11px] text-muted-foreground">{relTime}</span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>
    </Link>
  );
}

function ProfileCompletion({
  completeness,
  missingField,
  dismissed,
  onDismiss,
}: {
  completeness: number;
  missingField: "phone" | "photo" | "email" | "birthday" | null;
  dismissed: boolean;
  onDismiss: () => void;
}) {
  if (completeness >= 100 || dismissed) return null;
  const prompt = missingField ? MISSING_FIELD_PROMPT[missingField] : "Your profile looks great!";
  return (
    <Card className="border border-border/60 shadow-sm">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Your profile</p>
          <button
            onClick={onDismiss}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{prompt}</span>
            <span>{completeness}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${completeness}%` }}
            />
          </div>
        </div>
        <Link href="/profile">
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-full border-primary/30 text-primary hover:bg-primary/5 h-9"
          >
            Finish my profile
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Welcome() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const unitId = user?.familyUnit.id || "";
  const [completionDismissed, setCompletionDismissed] = useState(false);

  const { data, isLoading } = useQuery<HomeFeed>({
    queryKey: ["home-feed", unitId],
    queryFn: async () => {
      const token = localStorage.getItem("oliveToken");
      const res = await fetch(`/api/family-units/${unitId}/home-feed`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: !!unitId,
    staleTime: 60_000,
  });

  const handleContinue = () => setLocation("/dashboard");

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading || !data) {
    return (
      <div className="space-y-6 animate-pulse max-w-4xl mx-auto">
        <div className="h-10 w-64 bg-muted rounded-lg" />
        <div className="h-5 w-48 bg-muted rounded" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-muted rounded-xl" />
          <div className="h-24 bg-muted rounded-xl" />
        </div>
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  const { member, family, upcomingBirthdays, stats, recentUpdates } = data;

  // ── Right-column content (shared between mobile and desktop) ──────────────
  const RightColumn = () => (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex gap-3">
        <StatCard value={stats.birthdaysThisMonth} label="Birthdays this month" />
        <StatCard value={stats.newContactsCount} label="New contacts (30 days)" />
      </div>

      {/* Recent updates */}
      {recentUpdates.length > 0 && (
        <Card className="border-none shadow-sm bg-card">
          <CardContent className="px-5 py-4">
            <h3 className="font-serif text-base font-semibold text-foreground mb-1">
              Recent updates
            </h3>
            <div className="divide-y divide-border/40">
              {recentUpdates.map((item) => (
                <RecentUpdateRow key={item.memberId} item={item} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile completion */}
      <ProfileCompletion
        completeness={member.profileCompleteness}
        missingField={member.missingPriorityField}
        dismissed={completionDismissed}
        onDismiss={() => setCompletionDismissed(true)}
      />

      {/* Continue button */}
      <Button
        onClick={handleContinue}
        className="w-full rounded-full h-11"
      >
        Go to my family
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );

  // ── Birthdays column (shared) ─────────────────────────────────────────────
  const BirthdaysColumn = () => (
    <Card className="border-none shadow-sm bg-card">
      <CardContent className="px-5 py-4">
        <div className="flex items-center gap-2 mb-2">
          <Cake className="w-4 h-4 text-accent" />
          <h3 className="font-serif text-base font-semibold text-foreground">
            Upcoming birthdays
          </h3>
        </div>
        {upcomingBirthdays.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No birthdays on record yet.
          </p>
        ) : (
          upcomingBirthdays.map((entry, i) => (
            <BirthdayRow
              key={entry.memberId}
              entry={entry}
              index={i}
              onWishClick={(e) => onWish(e, toast)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
      {/* ── Welcome header ─────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Leaf className="w-5 h-5 text-primary" />
          <h1 className="text-3xl font-serif font-bold text-foreground">
            Welcome to the {family.unitName}
          </h1>
        </div>
        <p className="text-muted-foreground text-lg">
          {member.firstName
            ? `Hi ${member.firstName} — here's what's happening.`
            : "Here's what's happening in your family."}
        </p>
      </div>

      {/* ── Mobile: single column ──────────────────────────────────────────── */}
      <div className="md:hidden space-y-4">
        {/* Stats */}
        <div className="flex gap-3">
          <StatCard value={stats.birthdaysThisMonth} label="Birthdays this month" />
          <StatCard value={stats.newContactsCount} label="New contacts (30 days)" />
        </div>

        <BirthdaysColumn />

        {recentUpdates.length > 0 && (
          <Card className="border-none shadow-sm bg-card">
            <CardContent className="px-5 py-4">
              <h3 className="font-serif text-base font-semibold text-foreground mb-1">
                Recent updates
              </h3>
              <div className="divide-y divide-border/40">
                {recentUpdates.map((item) => (
                  <RecentUpdateRow key={item.memberId} item={item} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <ProfileCompletion
          completeness={member.profileCompleteness}
          missingField={member.missingPriorityField}
          dismissed={completionDismissed}
          onDismiss={() => setCompletionDismissed(true)}
        />

        <Button onClick={handleContinue} className="w-full rounded-full h-11">
          Go to my family
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* ── Desktop: two-column ────────────────────────────────────────────── */}
      <div className="hidden md:grid md:grid-cols-[1.4fr_1fr] gap-6">
        <BirthdaysColumn />
        <RightColumn />
      </div>
    </div>
  );
}
