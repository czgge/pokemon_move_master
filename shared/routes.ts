
import { z } from 'zod';
import { insertHighScoreSchema, pokemon, highScores, moves } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  game: {
    start: {
      method: 'POST' as const,
      path: '/api/game/start' as const,
      input: z.object({
        maxGen: z.number().min(1).max(9),
      }),
      responses: {
        200: z.object({
          roundId: z.string(),
          moves: z.array(z.object({
            name: z.string(),
            type: z.string(),
            power: z.number().nullable(),
            pp: z.number().nullable(),
            accuracy: z.number().nullable(),
          })),
          generation: z.number(),
          roundToken: z.string(), 
        }),
      },
    },
    answer: {
      method: 'POST' as const,
      path: '/api/game/answer' as const,
      input: z.object({
        roundToken: z.string(),
        guessedPokemonId: z.number(),
        attempt: z.number().min(1).max(3),
        hintsUsed: z.number().default(0),
      }),
      responses: {
        200: z.object({
          correct: z.boolean(),
          points: z.number(),
          correctPokemon: z.custom<typeof pokemon.$inferSelect>().optional(),
          livesRemaining: z.number(),
          missingMoves: z.array(z.string()).default([]),
        }).passthrough(),
      },
    },
    hint: {
      method: 'POST' as const,
      path: '/api/game/hint' as const,
      input: z.object({
        roundToken: z.string(),
        type: z.enum(['generation', 'type']),
      }),
      responses: {
        200: z.object({
          hint: z.string(),
        }),
      },
    }
  },
  pokedex: {
    list: {
      method: 'GET' as const,
      path: '/api/pokemon' as const,
      input: z.object({
        maxGen: z.string().optional(), // Query params are strings
        search: z.string().optional(),
        page: z.string().optional(),
      }).optional(),
      responses: {
        200: z.object({
          items: z.array(z.custom<typeof pokemon.$inferSelect>()),
          total: z.number(),
        }),
      },
    },
    search: { // Autocomplete endpoint
      method: 'GET' as const,
      path: '/api/pokemon/search' as const,
      input: z.object({
        query: z.string(),
        maxGen: z.string(),
      }),
      responses: {
        200: z.array(z.custom<typeof pokemon.$inferSelect>()),
      },
    }
  },
  leaderboard: {
    list: {
      method: 'GET' as const,
      path: '/api/leaderboard' as const,
      responses: {
        200: z.array(z.custom<typeof highScores.$inferSelect>()),
      },
    },
    submit: {
      method: 'POST' as const,
      path: '/api/leaderboard' as const,
      input: insertHighScoreSchema,
      responses: {
        201: z.custom<typeof highScores.$inferSelect>(),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type StartGameResponse = z.infer<typeof api.game.start.responses[200]>;
export type CheckAnswerResponse = z.infer<typeof api.game.answer.responses[200]>;
