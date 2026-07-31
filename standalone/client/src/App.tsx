import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, hasRole, userHasFeature, defaultPathForRole, type UserRole } from "@/contexts/auth-context";
import { AccessDenied } from "@/components/access-denied";
import { Layout } from "@/components/layout";
import type { FeatureKey } from "../../../shared/userPermissions.ts";
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
import AdminWorkbench from "@/pages/admin-workbench";
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
import Inventory from "@/pages/inventory";

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
  const [location] = useLocation();
  if (!user) return <Redirect to="/login" />;
  if (!hasRole(user, ...roles)) {
    const fallback = defaultPathForRole(user);
    if (fallback === location || fallback === "/login") {
      return <AccessDenied />;
    }
    return <Redirect to={fallback} />;
  }
  return <>{children}</>;
}

/** Sidebar + route share the same feature keys */
function FeatureGuard({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [location] = useLocation();
  if (!user) return <Redirect to="/login" />;
  if (!userHasFeature(user, feature)) {
    const fallback = defaultPathForRole(user);
    if (fallback === location || fallback === "/login") {
      return <AccessDenied />;
    }
    return <Redirect to={fallback} />;
  }
  return <>{children}</>;
}

function Guard({
  feature,
  roles,
  children,
}: {
  feature: FeatureKey;
  roles?: UserRole[];
  children: React.ReactNode;
}) {
  const inner = <FeatureGuard feature={feature}>{children}</FeatureGuard>;
  if (roles?.length) return <RoleGuard roles={roles}>{inner}</RoleGuard>;
  return inner;
}

/** Field engineer/technician only — not owner/admin (avoids mounting boss dashboard). */
function isFieldEngineerUser(user: NonNullable<ReturnType<typeof useAuth>["user"]>): boolean {
  return (
    hasRole(user, "engineer", "technician") &&
    !hasRole(user, "super_admin", "owner", "admin")
  );
}

/** Admin / owner daily workbench — not the stats dashboard. */
function isAdminWorkbenchUser(user: NonNullable<ReturnType<typeof useAuth>["user"]>): boolean {
  return hasRole(user, "super_admin", "owner", "admin");
}

/** Home `/`: engineers → engineer dashboard; admin/owner → admin workbench. */
function HomeRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (isFieldEngineerUser(user)) {
    return <Redirect to="/engineer-dashboard" />;
  }
  if (isAdminWorkbenchUser(user) || hasRole(user, "accountant")) {
    return <AdminWorkbench />;
  }
  return (
    <Guard feature="dashboard">
      <Dashboard />
    </Guard>
  );
}

/** Allow engineer/technician role OR feature key (fixes menu-visible but API/guard 403). */
function EngineerOrFeatureGuard({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [location] = useLocation();
  if (!user) return <Redirect to="/login" />;
  if (isFieldEngineerUser(user) || userHasFeature(user, feature)) {
    return <>{children}</>;
  }
  const fallback = defaultPathForRole(user);
  if (fallback === location || fallback === "/login") return <AccessDenied />;
  return <Redirect to={fallback} />;
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

  // Single auth redirect authority — do not also redirect from login.tsx / layout.
  if (!isAuthenticated) {
    if (location !== "/login") {
      return <Redirect to="/login" />;
    }
  } else if (user?.mustChangePassword) {
    if (location !== "/change-password") {
      return <Redirect to="/change-password" />;
    }
  } else if (location === "/login" || location === "/change-password") {
    const dest = defaultPathForRole(user!);
    if (dest !== location) {
      return <Redirect to={dest} />;
    }
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/change-password" component={ChangePasswordPage} />
      <Route>
        <Layout>
          <Switch>
            <Route path="/">
              <HomeRoute />
            </Route>
            <Route path="/admin-workbench">
              <HomeRoute />
            </Route>
            <Route path="/boss-dashboard">
              <Guard feature="dashboard"><Dashboard /></Guard>
            </Route>
            <Route path="/customers">
              <Guard feature="customers"><Customers /></Guard>
            </Route>
            <Route path="/customers/:id/history">
              {() => (
                <Guard feature="customers"><CustomerHistory /></Guard>
              )}
            </Route>
            <Route path="/customers/:id">
              {() => (
                <Guard feature="customers"><CustomerDetail /></Guard>
              )}
            </Route>
            <Route path="/quotes">
              <Guard feature="quotations"><Quotes /></Guard>
            </Route>
            <Route path="/work-orders/:workOrderId">
              {(params) => (
                <Redirect to={`/work-orders?highlight=${params.workOrderId}`} />
              )}
            </Route>
            <Route path="/work-orders">
              <EngineerOrFeatureGuard feature="dispatch_orders"><WorkOrders /></EngineerOrFeatureGuard>
            </Route>
            <Route path="/repair-cases">
              <Guard feature="repair_cases"><RepairCases /></Guard>
            </Route>
            <Route path="/payments">
              <Guard feature="receivables"><Payments /></Guard>
            </Route>
            <Route path="/receivables">
              <Guard feature="receivables"><Receivables /></Guard>
            </Route>
            <Route path="/warranties">
              <Guard feature="warranty_maintenance"><Warranties /></Guard>
            </Route>
            <Route path="/maintenance">
              <Guard feature="warranty_maintenance"><Maintenance /></Guard>
            </Route>
            <Route path="/engineer-dashboard">
              <EngineerOrFeatureGuard feature="dispatch_orders">
                <EngineerDashboard />
              </EngineerOrFeatureGuard>
            </Route>
            <Route path="/work-hours-stats">
              <Guard feature="work_hours"><WorkHoursStats /></Guard>
            </Route>
            <Route path="/products">
              <Guard feature="products"><Products /></Guard>
            </Route>
            <Route path="/wholesale/customers">
              <Guard feature="wholesale"><WholesaleCustomers /></Guard>
            </Route>
            <Route path="/wholesale/products">
              <Guard feature="wholesale"><WholesaleProducts /></Guard>
            </Route>
            <Route path="/wholesale/orders">
              <Guard feature="wholesale"><WholesaleOrders /></Guard>
            </Route>
            <Route path="/wholesale/settlements">
              <Guard feature="wholesale"><WholesaleSettlements /></Guard>
            </Route>
            <Route path="/inventory">
              <Guard feature="inventory"><Inventory /></Guard>
            </Route>
            <Route path="/employees">
              <Guard feature="employees"><Employees /></Guard>
            </Route>
            <Route path="/partner-culture">
              <Guard feature="company_culture"><PartnerCultureRoute /></Guard>
            </Route>
            <Route path="/partner-home">
              <Redirect to="/partner-culture" />
            </Route>
            <Route path="/partner-admin">
              <Redirect to="/partner-culture" />
            </Route>
            <Route path="/ai-assistant">
              <Guard feature="ai_assistant"><AiAssistant /></Guard>
            </Route>
            <Route path="/ai-work-reminders">
              <Redirect to="/ai-assistant?tab=work-reminders" />
            </Route>
            <Route path="/reminder-settings">
              <Redirect to="/ai-assistant" />
            </Route>
            <Route path="/notification-settings">
              <Guard feature="notifications"><NotificationSettings /></Guard>
            </Route>
            <Route path="/users">
              <Guard feature="users" roles={["super_admin", "owner"]}>
                <Users />
              </Guard>
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
