import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, hasRole, effectiveRoles, type UserRole, type AuthUser } from "@/contexts/auth-context";
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
import RepairCases from "@/pages/repair-cases";
import Payments from "@/pages/payments";
import Receivables from "@/pages/receivables";
import Warranties from "@/pages/warranties";
import Maintenance from "@/pages/maintenance";
import Users from "@/pages/users";
import EngineerDashboard from "@/pages/engineer-dashboard";
import Employees from "@/pages/employees";
import Products from "@/pages/products";
import WholesaleCustomers from "@/pages/wholesale-customers";
import WholesaleProducts from "@/pages/wholesale-products";
import WholesaleOrders from "@/pages/wholesale-orders";
import WholesaleSettlements from "@/pages/wholesale-settlements";
import PartnerCultureRoute from "@/pages/partner-culture-route";
import NotificationSettings from "@/pages/notification-settings";
import AiAssistant from "@/pages/ai-assistant";
import WorkHoursStats from "@/pages/work-hours-stats";

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
  if (!hasRole(user, ...roles)) return <Redirect to={defaultPathForRole(user)} />;
  return <>{children}</>;
}

/** Default landing path based on user's roles — checks in priority order */
function defaultPathForRole(user: AuthUser): string {
  const roles = effectiveRoles(user);
  if (roles.includes("super_admin")) return "/users";
  if (roles.includes("owner") || roles.includes("admin")) return "/";
  if (roles.includes("accountant")) return "/receivables";
  if (roles.includes("sales")) return "/customers";
  if (roles.includes("engineer") || roles.includes("technician")) return "/partner-culture";
  if (roles.includes("distributor")) return "/quotes";
  return "/";
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
    return <Redirect to={defaultPathForRole(user!)} />;
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
            <Route path="/repair-cases">
              <RoleGuard roles={["super_admin", "owner", "admin", "engineer", "technician", "sales"]}>
                <RepairCases />
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
              <RoleGuard roles={["super_admin", "owner", "admin", "engineer", "technician"]}>
                <EngineerDashboard />
              </RoleGuard>
            </Route>
            <Route path="/work-hours-stats">
              <RoleGuard roles={["super_admin", "owner", "admin", "accountant"]}>
                <WorkHoursStats />
              </RoleGuard>
            </Route>
            <Route path="/products">
              <RoleGuard roles={["super_admin", "owner", "admin", "sales"]}>
                <Products />
              </RoleGuard>
            </Route>
            <Route path="/wholesale/customers">
              <RoleGuard roles={["super_admin", "owner", "admin", "sales"]}>
                <WholesaleCustomers />
              </RoleGuard>
            </Route>
            <Route path="/wholesale/products">
              <RoleGuard roles={["super_admin", "owner", "admin", "sales"]}>
                <WholesaleProducts />
              </RoleGuard>
            </Route>
            <Route path="/wholesale/orders">
              <RoleGuard roles={["super_admin", "owner", "admin", "sales"]}>
                <WholesaleOrders />
              </RoleGuard>
            </Route>
            <Route path="/wholesale/settlements">
              <RoleGuard roles={["super_admin", "owner", "admin", "sales", "accountant"]}>
                <WholesaleSettlements />
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
            <Route path="/partner-culture">
              <RoleGuard roles={["super_admin", "owner", "admin", "engineer", "technician"]}>
                <PartnerCultureRoute />
              </RoleGuard>
            </Route>
            <Route path="/partner-home">
              <Redirect to="/partner-culture" />
            </Route>
            <Route path="/partner-admin">
              <Redirect to="/partner-culture" />
            </Route>
            <Route path="/ai-assistant">
              <RoleGuard roles={["super_admin", "owner", "admin", "sales", "accountant", "distributor", "engineer", "technician"]}>
                <AiAssistant />
              </RoleGuard>
            </Route>
            <Route path="/ai-work-reminders">
              <Redirect to="/ai-assistant?tab=work-reminders" />
            </Route>
            <Route path="/reminder-settings">
              <Redirect to="/ai-assistant" />
            </Route>
            <Route path="/notification-settings">
              <RoleGuard roles={["super_admin", "owner", "admin", "sales", "accountant", "engineer", "technician", "distributor"]}>
                <NotificationSettings />
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
        <WouterRouter>
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
