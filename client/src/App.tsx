import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import FormBuilder from "@/pages/form-builder";
import FormEntries from "@/pages/form-entries";

function Router() {
  return (
    <Switch>
      <Route path="/" component={FormBuilder} />
      <Route path="/entries" component={FormEntries} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
