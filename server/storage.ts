
import { db } from "./db";
import {
  highScores,
  pokemon,
  moves,
  pokemonMoves,
  generations,
  versions,
  type HighScore,
  type InsertHighScore,
  type Pokemon,
  type Move
} from "@shared/schema";
import { eq, lte, sql, and, inArray, desc } from "drizzle-orm";

export interface IStorage {
  // Leaderboard
  getHighScores(): Promise<HighScore[]>;
  createHighScore(score: InsertHighScore): Promise<HighScore>;

  // Pokemon Data Read
  getPokemon(id: number): Promise<Pokemon | undefined>;
  getAllPokemon(maxGen?: number, search?: string, limit?: number, offset?: number): Promise<{ items: Pokemon[], total: number }>;
  
  // Game Logic
  getRandomPokemon(maxGen: number, count: number): Promise<Pokemon[]>;
  getMovesForPokemon(pokemonId: number, maxGen: number): Promise<Move[]>;
  
  // Seeding Helpers
  seedGenerations(data: any[]): Promise<void>;
  seedVersions(data: any[]): Promise<void>;
  seedPokemon(data: any[]): Promise<void>;
  seedMoves(data: any[]): Promise<void>;
  seedPokemonMoves(data: any[]): Promise<void>;
  
  // Check if seeded
  isSeeded(): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getHighScores(): Promise<HighScore[]> {
    return await db.select().from(highScores).orderBy(desc(highScores.score)).limit(50);
  }

  async createHighScore(score: InsertHighScore): Promise<HighScore> {
    const [entry] = await db.insert(highScores).values(score).returning();
    return entry;
  }

  async getPokemon(id: number): Promise<Pokemon | undefined> {
    const [p] = await db.select().from(pokemon).where(eq(pokemon.id, id));
    return p;
  }

  async getAllPokemon(maxGen?: number, search?: string, limit: number = 20, offset: number = 0): Promise<{ items: Pokemon[], total: number }> {
    let conditions = [];
    if (maxGen) conditions.push(lte(pokemon.generationId, maxGen));
    if (search) conditions.push(sql`lower(${pokemon.name}) LIKE ${`%${search.toLowerCase()}%`}`);

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(pokemon)
      .where(whereClause);

    const items = await db
      .select()
      .from(pokemon)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(pokemon.id);

    return { items, total: Number(countResult.count) };
  }

  async getRandomPokemon(maxGen: number, count: number): Promise<Pokemon[]> {
    // This is a bit heavy for random, simpler to fetch IDs then fetch items, but for now:
    return await db
      .select()
      .from(pokemon)
      .where(lte(pokemon.generationId, maxGen))
      .orderBy(sql`RANDOM()`)
      .limit(count);
  }

  async getMovesForPokemon(pokemonId: number, maxGen: number): Promise<Move[]> {
    // We need to find moves that this pokemon learns in a version corresponding to the maxGen or earlier.
    // This implies joining pokemon_moves -> versions -> generations
    
    // Simplification: We'll fetch all moves for the pokemon, then filter in memory or complicated join.
    // Let's try a join.
    
    /* 
      pokemonMoves.versionGroupId links to versions? 
      Actually the CSV structure for pokemon_moves has version_identifier. 
      We need to map version_identifier -> generationId.
    */

    const result = await db.selectDistinct({
        id: moves.id,
        name: moves.name,
        type: moves.type,
        power: moves.power,
        accuracy: moves.accuracy,
        pp: moves.pp,
        generationId: moves.generationId
      })
      .from(moves)
      .innerJoin(pokemonMoves, eq(moves.id, pokemonMoves.moveId))
      .innerJoin(versions, eq(pokemonMoves.versionGroupId, versions.id)) // Wait, pokemonMoves needs a way to link to gen
      .where(and(
        eq(pokemonMoves.pokemonId, pokemonId),
        lte(versions.generationId, maxGen)
      ));
      
    return result;
  }

  // --- Seeding ---

  async seedGenerations(data: any[]) {
    if (data.length === 0) return;
    await db.insert(generations).values(data).onConflictDoNothing();
  }

  async seedVersions(data: any[]) {
     if (data.length === 0) return;
     await db.insert(versions).values(data).onConflictDoNothing();
  }

  async seedPokemon(data: any[]) {
     if (data.length === 0) return;
     // Batch insert to avoid huge query
     for (let i = 0; i < data.length; i += 1000) {
       await db.insert(pokemon).values(data.slice(i, i + 1000)).onConflictDoNothing();
     }
  }

  async seedMoves(data: any[]) {
     if (data.length === 0) return;
     for (let i = 0; i < data.length; i += 1000) {
       await db.insert(moves).values(data.slice(i, i + 1000)).onConflictDoNothing();
     }
  }

  async seedPokemonMoves(data: any[]) {
     if (data.length === 0) return;
     // This is the big one.
     for (let i = 0; i < data.length; i += 5000) {
       await db.insert(pokemonMoves).values(data.slice(i, i + 5000)).onConflictDoNothing();
     }
  }

  async isSeeded(): Promise<boolean> {
    const [g] = await db.select().from(generations).limit(1);
    return !!g;
  }
}

export const storage = new DatabaseStorage();
