import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  useGetUpcomingBirthdays,
  getGetUpcomingBirthdaysQueryKey,
} from "@workspace/api-client-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Cake, CalendarPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseDateLocal, formatBirthdayDate, getAgeTurning, sendBirthdayWish } from "@/lib/birthday";

// ── Calendar helpers ──────────────────────────────────────────────────────────

function nextOccurrence(birthday: string): { dateStr: string; nextDayStr: string } {
  const [, m, d] = birthday.split("-");
  const month = parseInt(m!, 10);
  const day = parseInt(d!, 10);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let year = today.getFullYear();
  if (new Date(year, month - 1, day) < today) year++;
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${year}${pad(month)}${pad(day)}`;
  const end = new Date(year, month - 1, day + 1);
  const nextDayStr = `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}`;
  return { dateStr, nextDayStr };
}

function googleCalendarUrl(entry: BirthdayEntry): string {
  const { dateStr, nextDayStr } = nextOccurrence(entry.birthday);
  const text = encodeURIComponent(`${entry.firstName} ${entry.lastName}'s Birthday`);
  const details = encodeURIComponent(`Happy Birthday, ${entry.firstName}!`);
  const recur = encodeURIComponent("RRULE:FREQ=YEARLY");
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dateStr}/${nextDayStr}&details=${details}&recur=${recur}`;
}

function downloadIcs(entry: BirthdayEntry) {
  const { dateStr, nextDayStr } = nextOccurrence(entry.birthday);
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Olive Family//EN",
    "BEGIN:VEVENT",
    `DTSTART;VALUE=DATE:${dateStr}`,
    `DTEND;VALUE=DATE:${nextDayStr}`,
    "RRULE:FREQ=YEARLY",
    `SUMMARY:${entry.firstName} ${entry.lastName}'s Birthday`,
    `DESCRIPTION:Happy Birthday\\, ${entry.firstName}!`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${entry.firstName.toLowerCase()}-birthday.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function getMonthLabel(birthday: string): string {
  const d = parseDateLocal(birthday);
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (thisYear < now) thisYear.setFullYear(now.getFullYear() + 1);
  return thisYear.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function DaysUntilBadge({ days }: { days: number }) {
  if (days === 0) {
    return (
      <Badge className="bg-accent text-accent-foreground text-[11px] font-semibold shrink-0">
        Today!
      </Badge>
    );
  }
  if (days === -1) {
    return (
      <Badge variant="secondary" className="text-[11px] font-semibold shrink-0">
        Yesterday
      </Badge>
    );
  }
  if (days < 0) {
    return (
      <Badge variant="outline" className="text-[11px] font-semibold shrink-0">
        {Math.abs(days)}d ago
      </Badge>
    );
  }
  if (days <= 7) {
    return (
      <Badge className="bg-primary/15 text-primary text-[11px] font-semibold shrink-0">
        In {days}d
      </Badge>
    );
  }
  if (days <= 30) {
    return (
      <Badge variant="secondary" className="text-[11px] font-semibold shrink-0">
        In {days}d
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[11px] font-semibold shrink-0">
      In {days}d
    </Badge>
  );
}

type BirthdayEntry = {
  personId: string;
  firstName: string;
  lastName: string;
  relationshipLabel: string;
  viewerRelationshipLabel?: string;
  unitName: string;
  birthday: string;
  showBirthYear: boolean;
  daysUntil: number;
  phone?: string | null;
  email?: string | null;
};

function BirthdayRow({ entry }: { entry: BirthdayEntry }) {
  const { toast } = useToast();
  const initials = (entry.firstName[0] || "?") + (entry.lastName[0] || "?");
  const showWish = Math.abs(entry.daysUntil) <= 7;
  return (
    <li key={entry.personId}>
      <div className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/40 transition-colors">
        <Link href={`/members/${entry.personId}`} className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer">
          <Avatar className="w-10 h-10 border border-primary/20 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary font-serif text-sm">
              {initials.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">
              {entry.firstName} {entry.lastName}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {entry.viewerRelationshipLabel ?? entry.relationshipLabel}
              {entry.unitName && (
                <span className="text-muted-foreground/60"> · {entry.unitName}</span>
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0 mr-2">
            <p className="text-sm font-medium text-foreground">
              {formatBirthdayDate(entry.birthday)}
              {getAgeTurning(entry.birthday, entry.showBirthYear) !== null && (
                <span className="text-xs text-muted-foreground ml-1">
                  ({entry.daysUntil >= 0 ? `Turns ${getAgeTurning(entry.birthday, entry.showBirthYear)}` : `Turned ${getAgeTurning(entry.birthday, entry.showBirthYear)}`})
                </span>
              )}
            </p>
            <DaysUntilBadge days={entry.daysUntil} />
          </div>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0 h-9 w-9 text-muted-foreground hover:text-primary"
              title="Add to calendar"
            >
              <CalendarPlus className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem asChild>
              <a href={googleCalendarUrl(entry)} target="_blank" rel="noreferrer">
                Google Calendar
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadIcs(entry)}>
              Apple / iCal (.ics)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {showWish && (
          <Button
            variant="outline"
            size="sm"
            className="flex-shrink-0 h-9 text-xs rounded-full border-primary/30 text-primary hover:bg-primary/5"
            onClick={() => sendBirthdayWish(entry, toast)}
          >
            Wish
          </Button>
        )}
      </div>
    </li>
  );
}

export default function Calendar() {
  const { user } = useAuth();
  const unitId = user?.familyUnit.id || "";

  const { data: birthdays, isLoading } = useGetUpcomingBirthdays(unitId, {
    query: {
      enabled: !!unitId,
      queryKey: getGetUpcomingBirthdaysQueryKey(unitId),
    },
  });

  const recentBirthdays = (birthdays ?? [])
    .filter(b => b.daysUntil < 0)
    .sort((a, b) => b.daysUntil - a.daysUntil); // most recent first

  const upcomingBirthdays = (birthdays ?? []).filter(b => b.daysUntil >= 0);

  // Group upcoming by month label
  const grouped: Record<string, typeof birthdays> = {};
  for (const entry of upcomingBirthdays) {
    const month = getMonthLabel(entry.birthday);
    if (!grouped[month]) grouped[month] = [];
    grouped[month]!.push(entry);
  }

  const monthKeys = Object.keys(grouped);

  return (
    <div className="space-y-8 max-w-2xl mx-auto animate-in fade-in duration-300">
      <div>
        <h1 className="text-4xl font-serif font-bold text-foreground">Birthdays</h1>
        <p className="text-muted-foreground mt-1">
          Upcoming birthdays across your family.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-5 w-28" />
              {[1, 2].map((j) => (
                <Skeleton key={j} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ))}
        </div>
      )}

      {!isLoading && recentBirthdays.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground tracking-widest uppercase">
            Recent
          </h2>
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {recentBirthdays.map((entry) => (
                  <BirthdayRow key={entry.personId} entry={entry} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {!isLoading && recentBirthdays.length === 0 && monthKeys.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
          <Cake className="w-12 h-12 opacity-30" />
          <div className="text-center">
            <p className="font-medium">No birthdays on record yet.</p>
            <p className="text-sm mt-1">
              Have family members fill in their birthday from their profile.
            </p>
          </div>
        </div>
      )}

      {monthKeys.map((month) => (
        <section key={month} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground tracking-widest uppercase">
            {month}
          </h2>
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {grouped[month]!.map((entry) => (
                  <BirthdayRow key={entry.personId} entry={entry} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
