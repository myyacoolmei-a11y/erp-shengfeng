import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, type UserRole } from "@/contexts/auth-context";
import { Layout } from "@/components/layout";
import LoginPage from "@/pages/login";
import ChangePasswordPage from "@/pages/change-password";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Customers from "@/pages/customers";
import CustomerDetail from "@/pages/customer-detail";
import CustomerHistory from "@/pages/customer-history";
import Quotes from "@/pages/quotes";
import WorkOrders from "@/pages/work-orders";
import Payments from "@/pages/payments";
import Receivables from "@/pages/receivables";
import Warranties from "@/pages/warranties";
import Maintenance from "@/pages/maintenance";
import Users from "@/pages/users";
import EngineerDashboard from "@/pages/engineer-dashboard";
import Employees from "@/pages/employees";
import Products from "@/pages/products";

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-4xl mb-4">🚧</p>
      <h2 className="text-xl font-bold mb-2">{title}</h2>
      <p className="text-muted-foreground text-sm">此功能即將推出，敬請期待。</p>
    </div>
  );
}

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
  if (!user) return <Redirect to="/login" />;
  if (!roles.includes(user.role)) return <Redirect to={defaultPathForRole(user.role)} />;
  return <>{children}</>;
}

/** Default landing path per role */
function defaultPathForRole(role: UserRole): string {
  switch (role) {
    case "super_admin":
      return "/users";
    case "engineer":
      return "/engineer-dashboard";
    case "technician":
      return "/work-orders";
    case "sales":
      return "/customers";
    case "accountant":
      return "/receivables";
    case "distributor":
      return "/quotes";
    default:
      return "/";
  }
}

function AppRoutes() {
  const { isAuthenticated, isLoading, user } = useAuth();
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

  if (isAuthenticated && user?.mustChangePassword && location !== "/change-password") {
    return <Redirect to="/change-password" />;
  }

  if (isAuthenticated && location === "/login") {
    return <Redirect to={defaultPathForRole(user!.role)} />;
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/change-password" component={ChangePasswordPage} />
      <Route>
        <Layout>
          <Switch>
            <Route path="/">
              <RoleGuard roles={["super_admin", "owner", "admin", "accountant"]}>
                <Dashboard />
              </RoleGuard>
            </Route>
            <Route path="/customers">
              <RoleGuard roles={["super_admin", "owner", "admin", "sales", "accountant"]}>
                <Customers />
              </RoleGuard>
            </Route>
            <Route path="/customers/:id/history">
              {() => (
                <RoleGuard roles={["super_admin", "owner", "admin", "sales", "accountant"]}>
                  <CustomerHistory />
                </RoleGuard>
              )}
            </Route>
            <Route path="/customers/:id">
              {() => (
                <RoleGuard roles={["super_admin", "owner", "admin", "sales", "accountant"]}>
                  <CustomerDetail />
                </RoleGuard>
              )}
            </Route>
            <Route path="/quotes">
              <RoleGuard roles={["super_admin", "owner", "admin", "sales", "distributor"]}>
                <Quotes />
              </RoleGuard>
            </Route>
            <Route path="/work-orders">
              <RoleGuard roles={["super_admin", "owner", "admin", "engineer", "technician"]}>
                <WorkOrders />
              </RoleGuard>
            </Route>
            <Route path="/payments">
              <RoleGuard roles={["super_admin", "owner", "admin", "accountant"]}>
                <Payments />
              </RoleGuard>
            </Route>
            <Route path="/receivables">
              <RoleGuard roles={["super_admin", "owner", "admin", "accountant"]}>
                <Receivables />
              </RoleGuard>
            </Route>
            <Route path="/warranties">
              <RoleGuard roles={["super_admin", "owner", "admin", "accountant"]}>
                <Warranties />
              </RoleGuard>
            </Route>
            <Route path="/maintenance">
              <RoleGuard roles={["super_admin", "owner", "admin", "engineer", "technician"]}>
                <Maintenance />
              </RoleGuard>
            </Route>
            <Route path="/engineer-dashboard">
              <RoleGuard roles={["super_admin", "owner", "admin", "engineer"]}>
                <EngineerDashboard />
              </RoleGuard>
            </Route>
            <Route path="/products">
              <RoleGuard roles={["super_admin", "owner", "admin", "sales"]}>
                <Products />
              </RoleGuard>
            </Route>
            <Route path="/wholesale">
              <RoleGuard roles={["super_admin", "owner", "admin"]}>
                <ComingSoon title="批發管理" />
              </RoleGuard>
            </Route>
            <Route path="/inventory">
              <RoleGuard roles={["super_admin", "owner", "admin"]}>
                <ComingSoon title="庫存管理" />
              </RoleGuard>
            </Route>
            <Route path="/employees">
              <RoleGuard roles={["super_admin", "owner", "admin"]}>
                <Employees />
              </RoleGuard>
            </Route>
            <Route path="/users">
              <RoleGuard roles={["super_admin", "owner"]}>
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
