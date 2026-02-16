
import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === GAME DATA TABLES (Seeded from CSVs) ===

export const generations = pgTable("generations", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

export const versions = pgTable("versions", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  identifier: text("identifier").notNull(), // e.g., "red-blue"
  generationId: integer("generation_id").references(() => generations.id),
});

export const pokemon = pgTable("pokemon", {
  id: integer("id").primaryKey(), // Using pokemon_form_id from CSV
  name: text("name").notNull(),   // identifier or form_name
  speciesName: text("species_name").notNull(), // from identifier
  generationId: integer("generation_id"), // Derived from version_group or manual mapping
  type1: text("type_1").notNull(),
  type2: text("type_2"),
  imageUrl: text("image_url"),
  cryUrl: text("cry_url"),
});

export const moves = pgTable("moves", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  power: integer("power"),
  accuracy: integer("accuracy"),
  pp: integer("pp"),
  generationId: integer("generation_id"),
});

// Mapping table for Pokemon <-> Moves (Huge table)
// We might optimize this by storing moves as a JSONB array on the pokemon table per version group if performance is an issue,
// but a proper relation is better for "reverse lookup" (finding pokemon by moveset).
export const pokemonMoves = pgTable("pokemon_moves", {
  id: serial("id").primaryKey(),
  pokemonId: integer("pokemon_id").references(() => pokemon.id),
  moveId: integer("move_id").references(() => moves.id),
  versionGroupId: integer("version_group_id"), // We'll map version identifiers to IDs
  level: integer("level").default(0),
  method: text("method"), // 'level-up', 'machine', 'tutor', 'egg'
});

// === LEADERBOARD ===

export const highScores = pgTable("high_scores", {
  id: serial("id").primaryKey(),
  playerName: text("player_name").notNull(),
  score: integer("score").notNull(),
  genFilter: integer("gen_filter"), // Max gen selected
  createdAt: timestamp("created_at").defaultNow(),
});

// === SCHEMA & TYPES ===

export const insertHighScoreSchema = createInsertSchema(highScores).omit({ id: true, createdAt: true });

export type Pokemon = typeof pokemon.$inferSelect;
export type Move = typeof moves.$inferSelect;
export type HighScore = typeof highScores.$inferSelect;
export type InsertHighScore = z.infer<typeof insertHighScoreSchema>;

// API Request/Response Types

export type GameConfig = {
  maxGen: number;
};

export type GameState = {
  score: number;
  lives: number;
  currentRound: number;
  gameOver: boolean;
};

export type RoundData = {
  moves: string[]; // List of 4 move names
  gen: number;     // The generation context for these moves
  correctPokemonId: number; // Hidden from user in frontend state usually, but sent for verification
  options: { id: number; name: string; imageUrl?: string }[]; // Multiple choice options
};

export type CheckGuessRequest = {
  pokemonId: number;
  correctPokemonId: number;
  usedHints: number;
  attemptNumber: number; // 1, 2, or 3
};

export type CheckGuessResponse = {
  correct: boolean;
  points: number;
  correctPokemon?: Pokemon; // Reveal if wrong/game over
};

export type PokemonFilterParams = {
  maxGen: number;
  search?: string;
  page?: number;
};
