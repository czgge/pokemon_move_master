import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type StartGameResponse, type CheckAnswerResponse } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

// === GAME HOOKS ===

export function useStartGame() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (maxGen: number) => {
      const res = await fetch(api.game.start.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxGen }),
        credentials: "include",
      });
      
      if (!res.ok) {
        throw new Error("Failed to start game");
      }
      
      return api.game.start.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      // Invalidate any old game state if we were caching it
      queryClient.invalidateQueries({ queryKey: ["game-state"] });
    },
    onError: (error) => {
      toast({
        title: "Error starting game",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useSubmitGuess() {
  return useMutation({
    mutationFn: async (data: { 
      roundToken: string; 
      guessedPokemonId: number; 
      attempt: number;
      hintsUsed: number;
    }) => {
      const res = await fetch(api.game.answer.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        throw new Error("Failed to submit answer");
      }
      
      return api.game.answer.responses[200].parse(await res.json());
    },
  });
}

export function useGetHint() {
  return useMutation({
    mutationFn: async (data: { roundToken: string; type: 'generation' | 'type' }) => {
      const res = await fetch(api.game.hint.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        throw new Error("Failed to get hint");
      }
      
      return api.game.hint.responses[200].parse(await res.json());
    },
  });
}

// === POKEDEX HOOKS ===

export function usePokemonList(params?: { maxGen?: string; search?: string; page?: string }) {
  const queryString = new URLSearchParams(params as Record<string, string>).toString();
  
  return useQuery({
    queryKey: [api.pokedex.list.path, params],
    queryFn: async () => {
      const res = await fetch(`${api.pokedex.list.path}?${queryString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pokemon");
      return api.pokedex.list.responses[200].parse(await res.json());
    },
  });
}

// === LEADERBOARD HOOKS ===

export function useLeaderboard() {
  return useQuery({
    queryKey: [api.leaderboard.list.path],
    queryFn: async () => {
      const res = await fetch(api.leaderboard.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return api.leaderboard.list.responses[200].parse(await res.json());
    },
  });
}

export function useSubmitScore() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { playerName: string; score: number; genFilter?: number }) => {
      const res = await fetch(api.leaderboard.submit.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        throw new Error("Failed to submit score");
      }
      
      return api.leaderboard.submit.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.leaderboard.list.path] });
      toast({
        title: "Score Saved!",
        description: "You've been added to the Hall of Fame.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save score. Try again.",
        variant: "destructive",
      });
    },
  });
}
