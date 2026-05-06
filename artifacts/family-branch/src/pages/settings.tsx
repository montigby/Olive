import { useAuth } from "@/lib/auth";
import { 
  useGetFamilyUnit, getGetFamilyUnitQueryKey,
  useUpdateFamilyUnit,
  useListLinkRequests, getListLinkRequestsQueryKey,
  useAcceptLinkRequest,
  useDeclineLinkRequest
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Network, Save, Check, X, Building2 } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const unitSchema = z.object({
  unitName: z.string().min(1, "Family unit name is required"),
});

export default function Settings() {
  const { user } = useAuth();
  const unitId = user?.familyUnit.id || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: unit, isLoading: isUnitLoading } = useGetFamilyUnit(unitId, {
    query: {
      enabled: !!unitId,
      queryKey: getGetFamilyUnitQueryKey(unitId)
    }
  });

  const { data: linkRequests, isLoading: isRequestsLoading } = useListLinkRequests(unitId, {
    query: {
      enabled: !!unitId,
      queryKey: getListLinkRequestsQueryKey(unitId)
    }
  });

  const updateUnitMutation = useUpdateFamilyUnit();
  const acceptMutation = useAcceptLinkRequest();
  const declineMutation = useDeclineLinkRequest();

  const form = useForm<z.infer<typeof unitSchema>>({
    resolver: zodResolver(unitSchema),
    values: {
      unitName: unit?.unitName || "",
    },
  });

  const onUpdateUnit = (data: z.infer<typeof unitSchema>) => {
    updateUnitMutation.mutate({ unitId, data }, {
      onSuccess: () => {
        toast({ title: "Settings saved successfully" });
        queryClient.invalidateQueries({ queryKey: getGetFamilyUnitQueryKey(unitId) });
      },
      onError: (error: any) => {
        toast({ variant: "destructive", title: "Update failed", description: error?.message });
      }
    });
  };

  const handleRequest = (requestId: string, action: 'accept' | 'decline') => {
    const mutation = action === 'accept' ? acceptMutation : declineMutation;
    
    mutation.mutate({ requestId }, {
      onSuccess: () => {
        toast({ title: `Request ${action}ed` });
        queryClient.invalidateQueries({ queryKey: getListLinkRequestsQueryKey(unitId) });
      },
      onError: (error: any) => {
        toast({ variant: "destructive", title: "Action failed", description: error?.message });
      }
    });
  };

  if (!user?.isAdmin) {
    return <div className="p-8 text-center">Only administrators can view unit settings.</div>;
  }

  const incomingRequests = linkRequests?.incoming.filter(r => r.status === 'pending') || [];
  const outgoingRequests = linkRequests?.outgoing.filter(r => r.status === 'pending') || [];

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Unit Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your family unit details and connections.</p>
      </div>

      <Card className="border-none shadow-sm bg-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" /> Directory Details
          </CardTitle>
          <CardDescription>Update your family unit name.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onUpdateUnit)} className="space-y-4 max-w-md">
              <FormField
                control={form.control}
                name="unitName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Family Name</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="pt-2">
                <FormLabel>Unique Unit Code</FormLabel>
                <div className="flex items-center gap-4 mt-2">
                  <code className="px-4 py-2 bg-secondary rounded font-mono text-lg tracking-wider text-secondary-foreground">
                    {unit?.unitCode || "------"}
                  </code>
                  <p className="text-sm text-muted-foreground">Share this code to let other family units find you easily.</p>
                </div>
              </div>

              <Button type="submit" className="mt-4" disabled={updateUnitMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm bg-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" /> Connection Requests
          </CardTitle>
          <CardDescription>Manage incoming and outgoing links to other family branches.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          <div>
            <h3 className="font-medium mb-4 text-sm uppercase tracking-wider text-muted-foreground">Incoming Requests</h3>
            {incomingRequests.length === 0 ? (
              <div className="p-4 text-center rounded-lg border border-dashed text-muted-foreground bg-[#FAF7F2]">
                No pending connection requests.
              </div>
            ) : (
              <div className="space-y-3">
                {incomingRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between p-4 rounded-lg bg-[#FAF7F2] border border-border/50">
                    <div>
                      <p className="font-bold">{req.requestingUnitName}</p>
                      <p className="text-sm text-muted-foreground mt-1">Requested by {req.connectorPersonName}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-destructive hover:bg-destructive hover:text-white"
                        onClick={() => handleRequest(req.id, 'decline')}
                        disabled={declineMutation.isPending || acceptMutation.isPending}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        className="bg-primary hover:bg-primary/90"
                        onClick={() => handleRequest(req.id, 'accept')}
                        disabled={declineMutation.isPending || acceptMutation.isPending}
                      >
                        <Check className="w-4 h-4 mr-1" /> Accept
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-medium mb-4 text-sm uppercase tracking-wider text-muted-foreground">Outgoing Requests</h3>
            {outgoingRequests.length === 0 ? (
              <div className="p-4 text-center rounded-lg border border-dashed text-muted-foreground bg-[#FAF7F2]">
                No outgoing connection requests.
              </div>
            ) : (
              <div className="space-y-3">
                {outgoingRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between p-4 rounded-lg bg-[#FAF7F2] border border-border/50">
                    <div>
                      <p className="font-bold">To: {req.targetUnitName}</p>
                      <p className="text-sm text-muted-foreground mt-1">Connecting through {req.connectorPersonName}</p>
                    </div>
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-200">
                      Pending
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
