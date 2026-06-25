import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Customers from "@/pages/customers";
import CustomerDetail from "@/pages/customer-detail";
import Quotes from "@/pages/quotes";
import WorkOrders from "@/pages/work-orders";
import Payments from "@/pages/payments";
import Warranties from "@/pages/warranties";
import Maintenance from "@/pages/maintenance";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/customers" component={Customers} />
        <Route path="/customers/:id" component={CustomerDetail} />
        <Route path="/quotes" component={Quotes} />
        <Route path="/work-orders" component={WorkOrders} />
        <Route path="/payments" component={Payments} />
        <Route path="/warranties" component={Warranties} />
        <Route path="/maintenance" component={Maintenance} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
