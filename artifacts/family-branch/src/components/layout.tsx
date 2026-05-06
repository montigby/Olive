import { useAuth } from "@/lib/auth";
import { Link, useLocation } from "wouter";
import { BookUser, LogOut, Settings, Users, Network, Home, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLogout } from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useState } from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const logoutMutation = useLogout();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary/20"></div>
        <div className="h-4 w-32 bg-primary/20 rounded"></div>
      </div>
    </div>;
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        logout();
        setLocation("/login");
      }
    });
  };

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: Home },
    { label: "Family Tree", href: "/tree", icon: Network },
    { label: "Directory", href: "/members", icon: Users },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  const NavLinks = () => (
    <>
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary text-foreground hover:text-primary transition-colors cursor-pointer" onClick={() => setIsMobileMenuOpen(false)}>
            <item.icon className="w-4 h-4" />
            <span className="font-medium">{item.label}</span>
          </div>
        </Link>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <BookUser className="w-4 h-4" />
          </div>
          <span className="font-serif font-bold text-xl">{user.familyUnit.unitName}</span>
        </div>
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 flex flex-col p-6">
            <div className="mb-8">
               <span className="font-serif font-bold text-2xl text-primary">FamilyBranch</span>
            </div>
            <nav className="flex flex-col gap-2 flex-1">
              <NavLinks />
            </nav>
            <div className="mt-auto pt-6 border-t">
              <div className="flex items-center gap-3 mb-4">
                <Avatar>
                  <AvatarImage src={user.photoUrl || undefined} />
                  <AvatarFallback className="bg-secondary text-secondary-foreground">
                    {user.firstName[0]}{user.lastName[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-bold">{user.firstName} {user.lastName}</span>
                  <span className="text-xs text-muted-foreground">{user.relationshipLabel}</span>
                </div>
              </div>
              <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-card p-6">
        <div className="mb-8 flex items-center gap-3">
           <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <BookUser className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-serif font-bold text-2xl leading-none text-foreground">FamilyBranch</h1>
            <p className="text-xs text-muted-foreground mt-1 truncate">{user.familyUnit.unitName}</p>
          </div>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          <NavLinks />
        </nav>

        <div className="mt-auto pt-6 border-t">
          <Link href="/profile">
            <div className="flex items-center gap-3 mb-4 p-2 rounded-md hover:bg-secondary cursor-pointer transition-colors">
              <Avatar>
                <AvatarImage src={user.photoUrl || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                  {user.firstName[0]}{user.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-bold truncate">{user.firstName} {user.lastName}</span>
                <span className="text-xs text-muted-foreground truncate">{user.relationshipLabel}</span>
              </div>
            </div>
          </Link>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-background">
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
