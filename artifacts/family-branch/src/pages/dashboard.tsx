import { useGetUnitSummary, getGetUnitSummaryQueryKey, useGetUpcomingBirthdays, getGetUpcomingBirthdaysQueryKey, useListLinkRequests, getListLinkRequestsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Link as LinkIcon, Gift, MailPlus, Cake, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { parseDateLocal, getAgeTurning } from "@/lib/birthday";

// A single connection-progress stat card.
// Shows the count prominently, a label, and a subtle "X of N" fraction
// to communicate how complete the family data is.
function StatCard({
  icon: Icon,
  iconColor,
  label,
  value,
  total,
  hint,
}: {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  value: number;
  total?: number;
  hint?: string;
}) {
  const pct = total !== undefined && total > 0
    ? `${Math.round((value / total) * 100)}%`
    : null;

  return (
    <Card className="bg-[#FAF7F2] border-none shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          {pct && (
            <span className="text-sm text-foreground font-semibold mt-1">{pct}</span>
          )}
        </div>
        <div className="mt-3">
          <h3 className="text-3xl font-serif font-bold leading-none">{value}</h3>
          <p className="text-sm font-medium text-muted-foreground mt-1">{label}</p>
          {hint && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();

  const unitId = user?.familyUnit.id || "";

  const { data: summary, isLoading: isSummaryLoading } = useGetUnitSummary(unitId, {
    query: {
      enabled: !!unitId,
      queryKey: getGetUnitSummaryQueryKey(unitId)
    }
  });

  const { data: birthdays, isLoading: isBirthdaysLoading } = useGetUpcomingBirthdays(unitId, {
    query: {
      enabled: !!unitId,
      queryKey: getGetUpcomingBirthdaysQueryKey(unitId)
    }
  });

  const { data: linkRequests } = useListLinkRequests(unitId, {
    query: {
      enabled: !!unitId,
      queryKey: getListLinkRequestsQueryKey(unitId)
    }
  });

  if (isSummaryLoading || !summary) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-serif font-bold text-foreground">Overview</h1>
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  }

  const incomingRequests = linkRequests?.incoming.filter(r => r.status === 'pending') || [];
  const recentBirthdays = (birthdays ?? []).filter(b => b.daysUntil < 0).sort((a, b) => b.daysUntil - a.daysUntil);
  const upcomingBirthdays = (birthdays ?? []).filter(b => b.daysUntil >= 0);
  const total = summary.totalMembers;
  const birthdayCount = summary.birthdayCount ?? 0;
  const phoneCount = summary.phoneCount ?? 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground">Welcome back, {user?.firstName}</h1>
        </div>
        {user?.isAdmin && (
          <Link href="/members">
            <Button className="rounded-full shadow-sm">
              <MailPlus className="w-4 h-4 mr-2" />
              Add Member
            </Button>
          </Link>
        )}
      </div>

      {/* Connection-progress stats — visible to everyone */}
      <div className="grid gap-4 grid-cols-3">
        <StatCard
          icon={Users}
          iconColor="bg-primary/10 text-primary"
          label="Family members"
          value={total}
          hint="People in your family"
        />
        <StatCard
          icon={Cake}
          iconColor="bg-accent/10 text-accent"
          label="Birthdays on record"
          value={birthdayCount}
          total={total}
          hint="Add more in profiles"
        />
        <StatCard
          icon={Phone}
          iconColor="bg-emerald-500/10 text-emerald-600"
          label="Phone numbers"
          value={phoneCount}
          total={total}
          hint="How many you can call"
        />
      </div>

      {/* Secondary content */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Upcoming birthdays */}
        <Card className="shadow-sm border-none bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-serif text-2xl flex items-center gap-2">
              <Gift className="w-5 h-5 text-accent" /> Upcoming Birthdays
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isBirthdaysLoading ? (
              <div className="space-y-3 mt-4">
                <Skeleton className="h-12 w-full rounded" />
                <Skeleton className="h-12 w-full rounded" />
              </div>
            ) : upcomingBirthdays.length > 0 ? (
              <div className="space-y-4 mt-4">
                {upcomingBirthdays.map((b) => (
                  <div key={b.personId} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border border-border">
                        <AvatarFallback className="bg-background text-foreground text-xs">
                          {b.firstName[0]}{b.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-sm">{b.firstName} {b.lastName}</p>
                        <p className="text-xs text-muted-foreground">{b.relationshipLabel} • {b.unitName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-sm text-accent">{b.daysUntil === 0 ? 'Today!' : `In ${b.daysUntil} days`}</p>
                      <p className="text-xs text-muted-foreground">
                        {parseDateLocal(b.birthday).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        {getAgeTurning(b.birthday, b.showBirthYear) !== null && ` · Turns ${getAgeTurning(b.birthday, b.showBirthYear)}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No upcoming birthdays in the next 30 days.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent birthdays */}
        {recentBirthdays.length > 0 && (
          <Card className="shadow-sm border-none bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-serif text-2xl flex items-center gap-2">
                <Cake className="w-5 h-5 text-accent" /> Recent Birthdays
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mt-4">
                {recentBirthdays.map((b) => (
                  <div key={b.personId} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border border-border">
                        <AvatarFallback className="bg-background text-foreground text-xs">
                          {b.firstName[0]}{b.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-sm">{b.firstName} {b.lastName}</p>
                        <p className="text-xs text-muted-foreground">{b.relationshipLabel} • {b.unitName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-sm text-muted-foreground">
                        {b.daysUntil === -1 ? 'Yesterday' : `${Math.abs(b.daysUntil)} days ago`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {parseDateLocal(b.birthday).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        {getAgeTurning(b.birthday, b.showBirthYear) !== null && ` · Turned ${getAgeTurning(b.birthday, b.showBirthYear)}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending link requests (admin only, when present) */}
        {incomingRequests.length > 0 && (
          <Card className="shadow-sm border-none bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-serif text-2xl flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-primary" /> Link Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mt-4">
                {incomingRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between p-4 rounded-lg bg-[#FAF7F2]">
                    <div>
                      <p className="font-bold text-sm">{req.requestingUnitName}</p>
                      <p className="text-xs text-muted-foreground mt-1">Wants to link through {req.connectorPersonName}</p>
                    </div>
                    <Link href="/settings">
                      <Button size="sm" variant="outline">Review</Button>
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
