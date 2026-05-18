import { useGetUnitSummary, getGetUnitSummaryQueryKey, useGetUpcomingBirthdays, getGetUpcomingBirthdaysQueryKey, useListLinkRequests, getListLinkRequestsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Link as LinkIcon, Gift, MailPlus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function parseDateLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
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

  const { data: linkRequests, isLoading: isLinksLoading } = useListLinkRequests(unitId, {
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground">Welcome back, {user?.firstName}</h1>
          <p className="text-muted-foreground mt-2 text-lg">Here's what's happening with {summary.unitName}.</p>
        </div>
        <Link href="/members">
          <Button className="rounded-full shadow-sm">
            <MailPlus className="w-4 h-4 mr-2" />
            Add Member
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-[#FAF7F2] border-none shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Members</p>
              <h3 className="text-3xl font-serif font-bold">{summary.totalMembers}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#FAF7F2] border-none shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent">
              <LinkIcon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Linked Units</p>
              <h3 className="text-3xl font-serif font-bold">{summary.linkedUnits}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#FAF7F2] border-none shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <MailPlus className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pending Invites</p>
              <h3 className="text-3xl font-serif font-bold">{summary.pendingInvites}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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
            ) : birthdays && birthdays.length > 0 ? (
              <div className="space-y-4 mt-4">
                {birthdays.map((b, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
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
                      <p className="text-xs text-muted-foreground">{parseDateLocal(b.birthday).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
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

        {incomingRequests.length > 0 && (
          <Card className="shadow-sm border-none bg-card border-accent/20">
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
