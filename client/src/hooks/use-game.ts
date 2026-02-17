import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

// Types derived from schema/routes
type StartGameInput = z.infer<typeof api.game.start.input>;
type StartGameResponse = z.infer<typeof api.game.start.responses[200]>;
type AnswerInput = z.infer<typeof api.game.answer.input>;
type AnswerResponse = z.infer<typeof api.game.answer.responses[200]>;
type HintInput = z.infer<typeof api.game.hint.input>;
type HintResponse = z.infer<typeof api.game.hint.responses[200]>;
type PokemonSearchInput = z.infer<typeof api.pokedex.search.input>;
type PokemonListResponse = z.infer<typeof api.pokedex.search.responses[200]>;
type HighScoreInput = z.infer<typeof api.leaderboard.submit.input>;

export function useStartGame() {
  return useMutation({
    mutationFn: async (data: StartGameInput) => {
      const res = await fetch(api.game.start.path, {
        method: api.game.start.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to start game");
      return api.game.start.responses[200].parse(await res.json());
    },
  });
}

export function useSubmitAnswer() {
  return useMutation({
    mutationFn: async (data: AnswerInput) => {
      const res = await fetch(api.game.answer.path, {
        method: api.game.answer.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to submit answer");
      return api.game.answer.responses[200].parse(await res.json());
    },
  });
}

export function useGetHint() {
  return useMutation({
    mutationFn: async (data: HintInput) => {
      const res = await fetch(api.game.hint.path, {
        method: api.game.hint.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to get hint");
      return api.game.hint.responses[200].parse(await res.json());
    },
  });
}

export function useSearchPokemon(query: string, maxGen: string) {
  return useQuery({
    queryKey: [api.pokedex.search.path, query, maxGen],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      
      const url = `${api.pokedex.search.path}?query=${encodeURIComponent(query)}&maxGen=${maxGen}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to search pokemon");
      return api.pokedex.search.responses[200].parse(await res.json());
    },
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 5, // Cache search results
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: [api.leaderboard.list.path],
    queryFn: async () => {
      const res = await fetch(api.leaderboard.list.path);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return api.leaderboard.list.responses[200].parse(await res.json());
    },
  });
}

export function useSubmitScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: HighScoreInput) => {
      const res = await fetch(api.leaderboard.submit.path, {
        method: api.leaderboard.submit.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to submit score");
      return api.leaderboard.submit.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.leaderboard.list.path] });
    },
  });
}
