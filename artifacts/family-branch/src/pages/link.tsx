import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useSearchFamilyUnits, getSearchFamilyUnitsQueryKey, useCreateLinkRequest } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Network, Search, ArrowRight, BookUser } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function LinkPage() {
  const { user } = useAuth();
  const unitId = user?.familyUnit.id || "";
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  
  // Use a simple timeout for debouncing in lieu of a custom hook
  useState(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(handler);
  });

  const { data: searchResults, isLoading: isSearching } = useSearchFamilyUnits(
    { q: debouncedQuery },
    {
      query: {
        enabled: debouncedQuery.length > 2,
        queryKey: getSearchFamilyUnitsQueryKey({ q: debouncedQuery }),
      }
    }
  );

  const createLinkMutation = useCreateLinkRequest();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedQuery(searchQuery);
  };

  const handleSendRequest = () => {
    if (!selectedUnit) return;

    createLinkMutation.mutate({
      unitId,
      data: {
        targetUnitId: selectedUnit.id,
        // Using current user as connector for simplicity, a full implementation 
        // would let them select which member is the connector
        connectorPersonId: user?.id || ""
      }
    }, {
      onSuccess: () => {
        toast({ title: "Link request sent successfully!" });
        setSelectedUnit(null);
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Failed to send request",
          description: error?.message || "Please try again."
        });
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center py-8">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-primary">
          <Network className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-serif font-bold text-foreground mb-4">Grow the Family Tree</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Link your directory to your parents, siblings, or extended family to build a connected family tree while maintaining control over your own unit.
        </p>
      </div>

      <Card className="bg-card border-none shadow-md overflow-hidden">
        <div className="bg-[#FAF7F2] p-6 border-b">
          <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by family name or unit code..."
              className="pl-12 pr-20 sm:pr-24 h-14 rounded-full bg-background border-border shadow-sm text-lg"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-4 sm:px-6">
              Find
            </Button>
          </form>
        </div>

        <CardContent className="p-0">
          {isSearching ? (
            <div className="p-12 text-center text-muted-foreground">Searching...</div>
          ) : searchResults && searchResults.length > 0 ? (
            <div className="divide-y">
              {searchResults.map((unit) => (
                <div key={unit.id} className="p-6 flex items-center justify-between hover:bg-secondary/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#EEF5F1] flex items-center justify-center text-[#4A7C59]">
                      <BookUser className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-serif font-bold text-xl">{unit.unitName}</h3>
                      <p className="text-sm text-muted-foreground">{unit.memberCount} members • Unit Code: {unit.unitCode}</p>
                    </div>
                  </div>

                  <Dialog open={selectedUnit?.id === unit.id} onOpenChange={(open) => !open && setSelectedUnit(null)}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="rounded-full" onClick={() => setSelectedUnit(unit)}>
                        Connect <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Connect with {unit.unitName}</DialogTitle>
                        <DialogDescription className="text-base pt-2">
                          This will send a request to the administrators of {unit.unitName}. Once accepted, your family units will be linked on the shared family tree.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-6 flex items-center justify-center gap-4">
                        <div className="text-center px-4 py-3 bg-secondary rounded-lg">
                          <p className="font-bold">{user?.familyUnit.unitName}</p>
                        </div>
                        <Network className="text-primary w-6 h-6" />
                        <div className="text-center px-4 py-3 bg-[#FAF7F2] rounded-lg border border-primary/20">
                          <p className="font-bold text-primary">{unit.unitName}</p>
                        </div>
                      </div>
                      <Button 
                        onClick={handleSendRequest} 
                        disabled={createLinkMutation.isPending}
                        className="w-full"
                      >
                        {createLinkMutation.isPending ? "Sending..." : "Send Link Request"}
                      </Button>
                    </DialogContent>
                  </Dialog>
                </div>
              ))}
            </div>
          ) : debouncedQuery.length > 2 ? (
            <div className="p-12 text-center text-muted-foreground">
              <p>No family units found matching "{debouncedQuery}".</p>
              <p className="text-sm mt-2">Try searching with a specific unit code if you have one.</p>
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              <p>Enter a family name or 6-character code to search.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
