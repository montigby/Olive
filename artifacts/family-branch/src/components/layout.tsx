import { useAuth } from "@/lib/auth";
import { Link, useLocation } from "wouter";
import { BookUser, LogOut, Settings, Users, Network, Home, Cake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLogout } from "@workspace/api-client-react";
import { AiChatWidget } from "@/components/AiChatWidget";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const logoutMutation = useLogout();

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
    { label: "Birthdays", href: "/birthdays", icon: Cake },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  const DesktopNavLinks = () => (
    <>
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary text-foreground hover:text-primary transition-colors cursor-pointer">
            <item.icon className="w-4 h-4" />
            <span className="font-medium">{item.label}</span>
          </div>
        </Link>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header — logo only, no hamburger */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <BookUser className="w-4 h-4" />
          </div>
          <span className="font-serif font-bold text-xl">{user.lastName ? `${user.lastName} Family` : user.familyUnit.unitName}</span>
        </div>
        <Link href="/profile">
          <Avatar className="w-8 h-8 cursor-pointer">
            <AvatarImage src={user.photoUrl || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {user.firstName[0]}{user.lastName[0]}
            </AvatarFallback>
          </Avatar>
        </Link>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-card p-6">
        <div className="mb-8 flex items-center gap-3">
           <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <BookUser className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-serif font-bold text-2xl leading-none text-foreground">Olive</h1>
            <p className="text-xs text-muted-foreground mt-1 truncate">{user.lastName ? `${user.lastName} Family` : user.familyUnit.unitName}</p>
          </div>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          <DesktopNavLinks />
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

      {/* Main content — add bottom padding on mobile to clear the tab bar */}
      <main className="flex-1 overflow-auto bg-background pb-20 md:pb-0">
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex items-stretch h-16 shadow-[0_-1px_8px_rgba(0,0,0,0.08)]">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <div className={`flex flex-col items-center justify-center h-full gap-0.5 transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.2]" : "stroke-[1.6]"}`} />
                <span className={`text-[10px] leading-tight font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>

      <AiChatWidget />
    </div>
  );
}
