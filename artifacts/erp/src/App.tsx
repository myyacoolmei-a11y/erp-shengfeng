import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, type UserRole } from "@/contexts/auth-context";
import { Layout } from "@/components/layout";
import { AccessDenied } from "@/components/access-denied";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Customers from "@/pages/customers";
import CustomerDetail from "@/pages/customer-detail";
import Quotes from "@/pages/quotes";
import WorkOrders from "@/pages/work-orders";
import Payments from "@/pages/payments";
import Warranties from "@/pages/warranties";
import Maintenance from "@/pages/maintenance";
import Users from "@/pages/users";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          (error as { status: number }).status === 401
        ) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

function RoleGuard({
  roles,
  children,
}: {
  roles: UserRole[];
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return <AccessDenied />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated && location !== "/login") {
    return <Redirect to="/login" />;
  }

  if (isAuthenticated && location === "/login") {
    return <Redirect to="/" />;
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route>
        <Layout>
          <Switch>
            <Route path="/">
              <RoleGuard roles={["owner", "admin", "accountant", "technician"]}>
                <Dashboard />
              </RoleGuard>
            </Route>
            <Route path="/customers">
              <RoleGuard roles={["owner", "admin", "accountant"]}>
                <Customers />
              </RoleGuard>
            </Route>
            <Route path="/customers/:id">
              {(params) => (
                <RoleGuard roles={["owner", "admin", "accountant"]}>
                  <CustomerDetail />
                </RoleGuard>
              )}
            </Route>
            <Route path="/quotes">
              <RoleGuard roles={["owner", "admin", "accountant"]}>
                <Quotes />
              </RoleGuard>
            </Route>
            <Route path="/work-orders">
              <RoleGuard roles={["owner", "admin", "technician"]}>
                <WorkOrders />
              </RoleGuard>
            </Route>
            <Route path="/payments">
              <RoleGuard roles={["owner", "admin", "accountant"]}>
                <Payments />
              </RoleGuard>
            </Route>
            <Route path="/warranties">
              <RoleGuard roles={["owner", "admin", "accountant"]}>
                <Warranties />
              </RoleGuard>
            </Route>
            <Route path="/maintenance">
              <RoleGuard roles={["owner", "admin", "technician"]}>
                <Maintenance />
              </RoleGuard>
            </Route>
            <Route path="/users">
              <RoleGuard roles={["owner"]}>
                <Users />
              </RoleGuard>
            </Route>
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
