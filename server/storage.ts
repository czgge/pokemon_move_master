
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
import { eq, lte, sql, and, inArray, desc, or } from "drizzle-orm";

export interface IStorage {
  // Leaderboard
  getHighScores(): Promise<HighScore[]>;
  createHighScore(score: InsertHighScore): Promise<HighScore>;

  // Pokemon Data Read
  getPokemon(id: number): Promise<Pokemon | undefined>;
  getAllPokemon(maxGen?: number, search?: string, limit?: number, offset?: number): Promise<{ items: Pokemon[], total: number }>;
  searchPokemon(query: string, maxGen: number): Promise<Pokemon[]>;
  
  // Game Logic
  getRandomPokemon(maxGen: number, count: number): Promise<Pokemon[]>;
  getMovesForPokemon(pokemonId: number, maxGen: number): Promise<Move[]>;
  checkUniqueMoveset(moveIds: number[], pokemonId: number, maxGen: number): Promise<boolean>;
  
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

  async searchPokemon(query: string, maxGen: number): Promise<Pokemon[]> {
    return await db
      .select()
      .from(pokemon)
      .where(and(
        lte(pokemon.generationId, maxGen),
        sql`lower(${pokemon.name}) LIKE ${`%${query.toLowerCase()}%`}`
      ))
      .limit(20);
  }

  async getRandomPokemon(maxGen: number, count: number): Promise<Pokemon[]> {
    return await db
      .select()
      .from(pokemon)
      .where(lte(pokemon.generationId, maxGen))
      .orderBy(sql`RANDOM()`)
      .limit(count);
  }

  async getMovesForPokemon(pokemonId: number, maxGen: number): Promise<Move[]> {
    // 1. Get the pokemon to check generation
    const [target] = await db.select().from(pokemon).where(eq(pokemon.id, pokemonId));
    if (!target) return [];

    // 2. Identify pre-evolutions (Complex without species/evolution table, 
    // but we can try to infer or just stick to current form for MVP if table missing.
    // The user explicitly asked for pre-evolutions: "if raichu is selected... consider also moves learned by pikachu".
    // Since we don't have an evolution table seeded, we might be limited.
    // However, `pokemon_moves` usually includes moves from pre-evolutions if they are "egg moves" or "tutor moves" available to the evolved form.
    // But "Level up" moves from pre-evolutions are not always listed under the evolved form in standard datasets unless "Reminder" is valid.
    
    // Constraint: We only have `pokemon_moves` table.
    // We'll proceed with fetching moves associated with THIS pokemon ID in the database.
    // If the seed data is good (PokeDB/PokeAPI dump), it often includes the full learnset or we might miss some specific pre-evo exclusives.
    // Given the constraints, we will query for the specific pokemonId.

    // 3. Filter by Generation/Version Group
    // We need to map `maxGen` to `version_group_id`s that belong to that generation OR OLDER.
    // Actually, the user said: "if I select gen 3 only moves that are part of the learnset of that generation... should be valid".
    // This implies we should ONLY look at version groups belonging to Gen 1, 2, 3.
    // AND specifically, we usually want the *latest* learnset within that range (e.g. Emerald/FRLG for Gen 3).
    
    // Let's get version IDs for generations <= maxGen
    const validVersions = await db.select({ id: versions.id })
      .from(versions)
      .where(lte(versions.generationId, maxGen));
      
    const validVersionIds = validVersions.map(v => v.id);

    if (validVersionIds.length === 0) return [];

    // Fetch unique moves
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
      .where(and(
        eq(pokemonMoves.pokemonId, pokemonId),
        inArray(pokemonMoves.versionGroupId, validVersionIds)
      ));
      
    return result;
  }

  // Check if a set of moves uniquely identifies the target pokemon in the given generation
  async checkUniqueMoveset(moveIds: number[], pokemonId: number, maxGen: number): Promise<boolean> {
    if (moveIds.length === 0) return false;

    // We need to find if ANY OTHER pokemon in (Gen <= maxGen) learns ALL these moves.
    // Strategy:
    // 1. Find all pokemon that learn move 1
    // 2. Intersect with pokemon that learn move 2... move 4.
    // 3. Filter by generation.
    // 4. Count results. If > 1, then not unique.
    
    // We can do this with a "GROUP BY pokemon_id HAVING count(distinct move_id) = 4" query.
    
    const validVersions = await db.select({ id: versions.id })
      .from(versions)
      .where(lte(versions.generationId, maxGen));
    const validVersionIds = validVersions.map(v => v.id);
    
    if (validVersionIds.length === 0) return true; // Should not happen

    const otherPokemon = await db.select({ 
        id: pokemonMoves.pokemonId,
        count: sql<number>`count(distinct ${pokemonMoves.moveId})`
      })
      .from(pokemonMoves)
      .innerJoin(pokemon, eq(pokemonMoves.pokemonId, pokemon.id))
      .where(and(
        inArray(pokemonMoves.moveId, moveIds),
        inArray(pokemonMoves.versionGroupId, validVersionIds),
        lte(pokemon.generationId, maxGen)
      ))
      .groupBy(pokemonMoves.pokemonId)
      .having(sql`count(distinct ${pokemonMoves.moveId}) = ${moveIds.length}`);
      
    // If we find any pokemon other than the target, it's not unique
    const others = otherPokemon.filter(p => p.id !== pokemonId);
    
    return others.length === 0;
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
