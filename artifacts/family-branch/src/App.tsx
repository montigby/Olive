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
const Tree = lazy(() => import("@/pages/tree"));
const Members = lazy(() => import("@/pages/members"));
const Profile = lazy(() => import("@/pages/profile"));
const LinkPage = lazy(() => import("@/pages/link"));
const Settings = lazy(() => import("@/pages/settings"));

const queryClient = new QueryClient();

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/invite/:token" component={InviteClaim} />

      <Route path="/:path*">
        <Layout>
          <Suspense fallback={
            <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
              <p className="text-muted-foreground font-medium">Loading...</p>
            </div>
          }>
            <Switch>
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/tree" component={Tree} />
              <Route path="/members" component={Members} />
              <Route path="/members/:personId" component={Profile} />
              <Route path="/profile" component={Profile} />
              <Route path="/link" component={LinkPage} />
              <Route path="/settings" component={Settings} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </Layout>
      </Route>
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
