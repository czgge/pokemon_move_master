import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import GameSetup from "@/pages/GameSetup";
import GamePlay from "@/pages/GamePlay";
import Leaderboard from "@/pages/Leaderboard";
import Pokedex from "@/pages/Pokedex";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/game/setup" component={GameSetup} />
      <Route path="/game/play" component={GamePlay} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/pokedex" component={Pokedex} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
