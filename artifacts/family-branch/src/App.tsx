import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";

import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Register from "@/pages/register";
import InviteClaim from "@/pages/invite-claim";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const Welcome   = lazy(() => import("@/pages/welcome"));
const Tree = lazy(() => import("@/pages/tree"));
const Members = lazy(() => import("@/pages/members"));
const Profile = lazy(() => import("@/pages/profile"));
const Calendar = lazy(() => import("@/pages/calendar"));
const LinkPage = lazy(() => import("@/pages/link"));
const Settings = lazy(() => import("@/pages/settings"));

const queryClient = new QueryClient();

const fallback = (
  <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
    <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    <p className="text-muted-foreground font-medium">Loading...</p>
  </div>
);

// Each protected page gets its own top-level Route so Wouter v3 sets params
// correctly in the routing context (nested /:path* breaks param extraction).
function makePage(Component: React.ComponentType) {
  return function Page() {
    return (
      <Layout>
        <Suspense fallback={fallback}>
          <Component />
        </Suspense>
      </Layout>
    );
  };
}

const DashboardPage = makePage(Dashboard);
const WelcomePage   = makePage(Welcome);
const TreePage     = makePage(Tree);
const MembersPage  = makePage(Members);
const ProfilePage  = makePage(Profile);
const CalendarPage = makePage(Calendar);
const LinkPageW    = makePage(LinkPage);
const SettingsPage = makePage(Settings);
const NotFoundPage = makePage(NotFound);

function AppRouter() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/"                component={Landing}     />
      <Route path="/login"           component={Login}       />
      <Route path="/register"        component={Register}    />
      <Route path="/invite/:token"   component={InviteClaim} />

      {/* Protected — order matters: more-specific paths first */}
      <Route path="/welcome"           component={WelcomePage}  />
      <Route path="/members/:personId" component={ProfilePage}  />
      <Route path="/members"           component={MembersPage}  />
      <Route path="/dashboard"         component={DashboardPage}/>
      <Route path="/tree"              component={TreePage}     />
      <Route path="/profile"           component={ProfilePage}  />
      <Route path="/calendar"          component={CalendarPage} />
      <Route path="/link"              component={LinkPageW}    />
      <Route path="/settings"          component={SettingsPage} />

      <Route component={NotFoundPage} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
