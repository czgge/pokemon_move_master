import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import GameSetup from "@/pages/GameSetup";
import GamePlay from "@/pages/GamePlay";
import Leaderboard from "@/pages/Leaderboard";
import Pokedex from "@/pages/Pokedex";
import AdminReset from "@/pages/AdminReset";
import Admin from "@/pages/Admin";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/game/setup" component={GameSetup} />
      <Route path="/game/play" component={GamePlay} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/pokedex" component={Pokedex} />
      <Route path="/admin/reset" component={AdminReset} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
