import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "@/pages/Home";
import Phase2Page from "@/pages/Phase2";
import Phase3Page from "@/pages/Phase3";
import Phase4Page from "@/pages/Phase4";

function Router() {
  return <DashboardLayout><Switch><Route path="/"><Home /></Route><Route path="/orders/:id">{params => <Phase4Page module="order" orderId={Number(params.id)} />}</Route><Route path="/orders" component={Home} /><Route path="/production" component={Home} /><Route path="/customers" component={Home} /><Route path="/reports" component={Home} /><Route path="/users" component={Home} /><Route path="/payments"><Phase4Page module="payments" /></Route><Route path="/expenses"><Phase4Page module="expenses" /></Route><Route path="/finance-reports"><Phase4Page module="reports" /></Route><Route path="/employees"><Phase3Page module="employees" /></Route><Route path="/machines"><Phase3Page module="machines" /></Route><Route path="/management-reports"><Phase3Page module="reports" /></Route><Route path="/alerts"><Phase3Page module="alerts" /></Route><Route path="/attendance"><Phase2Page module="attendance" /></Route><Route path="/cutting"><Phase2Page module="cutting" /></Route><Route path="/sewing" component={Home} /><Route path="/printing"><Phase2Page module="printing" /></Route><Route path="/qc"><Phase2Page module="qc" /></Route><Route path="/packing"><Phase2Page module="packing" /></Route><Route path="/delivery"><Phase2Page module="delivery" /></Route><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></DashboardLayout>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
