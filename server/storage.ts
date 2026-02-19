
import { db } from "./db";
import {
  highScores,
  pokemon,
  moves,
  pokemonMoves,
  generations,
  versions,
  evolutions,
  type HighScore,
  type InsertHighScore,
  type Pokemon,
  type Move
} from "../shared/schema";
import { eq, lte, sql, and, inArray, desc, or } from "drizzle-orm";

export interface IStorage {
  // Leaderboard
  getHighScores(genFilter?: number): Promise<HighScore[]>;
  createHighScore(score: InsertHighScore): Promise<HighScore>;

  // Pokemon Data Read
  getPokemon(id: number): Promise<Pokemon | undefined>;
  getAllPokemon(maxGen?: number, search?: string, limit?: number, offset?: number): Promise<{ items: Pokemon[], total: number }>;
  searchPokemon(query: string, maxGen: number): Promise<Pokemon[]>;
  searchPokemonForGame(query: string, maxGen: number): Promise<Pokemon[]>;
  
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
  seedEvolutions(data: any[]): Promise<void>;
  
  // Evolution Chain Helpers
  getEvolutionChain(speciesId: number): Promise<number[]>;
  getPokemonWithPreEvolutions(speciesId: number): Promise<number[]>;
  getFullEvolutionFamily(speciesId: number): Promise<number[]>;
  areSameSpeciesOrCosmeticForm(pokemonId1: number, pokemonId2: number): Promise<boolean>;
  
  // Check if seeded
  isSeeded(): Promise<boolean>;
}

export // Cache for valid version IDs by generation
const versionCache = new Map<number, number[]>();

async function getValidVersionIds(maxGen: number): Promise<number[]> {
  if (versionCache.has(maxGen)) {
    return versionCache.get(maxGen)!;
  }
  
  const validVersions = await db.select({ id: versions.id })
    .from(versions)
    .where(lte(versions.generationId, maxGen));
  
  const ids = validVersions.map(v => v.id);
  versionCache.set(maxGen, ids);
  return ids;
}

class DatabaseStorage implements IStorage {
  async getHighScores(genFilter?: number): Promise<HighScore[]> {
    if (genFilter) {
      return await db.select()
        .from(highScores)
        .where(eq(highScores.genFilter, genFilter))
        .orderBy(desc(highScores.score))
        .limit(50);
    }
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
    // Used by Pokedex - shows ALL forms
    return await db
      .select()
      .from(pokemon)
      .where(and(
        lte(pokemon.generationId, maxGen),
        sql`lower(${pokemon.name}) LIKE ${`%${query.toLowerCase()}%`}`
      ))
      .limit(20);
  }

  async searchPokemonForGame(query: string, maxGen: number): Promise<Pokemon[]> {
    // Search and deduplicate by ndexId (keep only one form per Pokemon)
    try {
      console.log(`[searchPokemonForGame] query="${query}", maxGen=${maxGen}`);
      
      const results = await db
        .select()
        .from(pokemon)
        .where(and(
          lte(pokemon.generationId, maxGen),
          // Search in speciesName with word boundaries to avoid partial matches like "cast" matching "cherrim"
          sql`(lower(${pokemon.speciesName}) LIKE ${`${query.toLowerCase()}%`} OR lower(${pokemon.speciesName}) LIKE ${`%-${query.toLowerCase()}%`})`
        ))
        .orderBy(pokemon.ndexId)
        .limit(50);
      
      console.log(`[searchPokemonForGame] Found ${results.length} raw results`);
      if (results.length > 0) {
        console.log(`[searchPokemonForGame] First result: ${results[0].name}, speciesName: ${results[0].speciesName}`);
      }
      
      // Group by ndexId and prefer default forms
      const ndexMap = new Map<number, Pokemon[]>();
      
      for (const pkmn of results) {
        if (!ndexMap.has(pkmn.ndexId)) {
          ndexMap.set(pkmn.ndexId, []);
        }
        ndexMap.get(pkmn.ndexId)!.push(pkmn);
      }
      
      // For each ndex, pick the best form (prefer -default, then no suffix, then first)
      const finalResults: Pokemon[] = [];
      for (const [ndexId, forms] of ndexMap.entries()) {
        if (forms.length > 1) {
          console.log(`[searchPokemonForGame] ndex ${ndexId} has ${forms.length} forms:`, forms.map(f => f.speciesName));
        }
        
        // Find default form
        let chosen = forms.find(f => f.speciesName.endsWith('-default'));
        
        // If no -default, find form without suffix (base form)
        if (!chosen) {
          chosen = forms.find(f => !f.speciesName.includes('-'));
        }
        
        // Otherwise, take the first one
        if (!chosen) {
          chosen = forms[0];
        }
        
        if (forms.length > 1) {
          console.log(`[searchPokemonForGame] Chose: ${chosen.speciesName}`);
        }
        
        // Clean up the display name - capitalize and remove -default suffix
        const baseName = chosen.speciesName.replace(/-default.*/, '').split('-')[0];
        const displayName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
        
        finalResults.push({
          ...chosen,
          name: displayName
        });
        
        if (finalResults.length >= 20) break;
      }
      
      console.log(`[searchPokemonForGame] Returning ${finalResults.length} unique results`);
      
      return finalResults;
    } catch (error) {
      console.error("Error in searchPokemonForGame:", error);
      return [];
    }
  }

  async getRandomPokemon(maxGen: number, count: number): Promise<Pokemon[]> {
    // Get random Pokemon, avoiding cosmetic form duplicates
    const pool = await db
      .select()
      .from(pokemon)
      .where(lte(pokemon.generationId, maxGen))
      .orderBy(sql`RANDOM()`)
      .limit(count * 3);
    
    // DEFINITIVE list of purely cosmetic forms
    const cosmeticSuffixes = [
      '-a', '-b', '-c', '-d', '-e', '-f', '-g', '-h', '-i', '-j', '-k', '-l', '-m',
      '-n', '-o', '-p', '-q', '-r', '-s', '-t', '-u', '-v', '-w', '-x', '-y', '-z',
      '-exclamation', '-question',
      // NOTE: Excluding '-default' because Tapu Pokemon use it but are NOT cosmetic
      '-sunny', '-rainy', '-snowy',
      '-plant', '-sandy', '-trash',
      '-west', '-east',
      '-normal', '-fighting', '-flying', '-poison', '-ground', '-rock', '-bug', '-ghost',
      '-steel', '-fire', '-water', '-grass', '-electric', '-psychic', '-ice', '-dragon',
      '-dark', '-fairy',
      '-red-striped', '-blue-striped', '-white-striped',
      '-spring', '-summer', '-autumn', '-winter',
      '-meadow', '-icy-snow', '-polar', '-tundra', '-continental', '-garden', '-elegant',
      '-modern', '-marine', '-archipelago', '-high-plains', '-sandstorm', '-river',
      '-monsoon', '-savanna', '-sun', '-ocean', '-jungle', '-fancy', '-poke-ball',
      '-red', '-yellow', '-orange', '-blue', '-white',
      '-natural', '-heart', '-star', '-diamond', '-debutante', '-matron', '-dandy',
      '-la-reine', '-kabuki', '-pharaoh',
      '-average', '-small', '-large', '-super',
      '-neutral', '-active',
      '-fighting-memory', '-flying-memory', '-poison-memory', '-ground-memory',
      '-rock-memory', '-bug-memory', '-ghost-memory', '-steel-memory', '-fire-memory',
      '-water-memory', '-grass-memory', '-electric-memory', '-psychic-memory',
      '-ice-memory', '-dragon-memory', '-dark-memory', '-fairy-memory',
      '-red-core', '-orange-core', '-yellow-core', '-green-core', '-blue-core',
      '-indigo-core', '-violet-core', '-meteor',
      '-phony', '-antique',
      '-vanilla-cream', '-ruby-cream', '-matcha-cream', '-mint-cream', '-lemon-cream',
      '-salted-cream', '-ruby-swirl', '-caramel-swirl', '-rainbow-swirl',
      '-family-of-three', '-family-of-four',
      '-green-plumage', '-blue-plumage', '-yellow-plumage', '-white-plumage',
      '-two-segment', '-three-segment',
      '-counterfeit', '-artisan',
    ];
    
    const seen = new Set<string>();
    const unique = pool.filter(p => {
      const speciesLower = p.speciesName.toLowerCase();
      const isCosmeticForm = cosmeticSuffixes.some(suffix => speciesLower.endsWith(suffix));
      const key = isCosmeticForm ? speciesLower.split('-')[0] : speciesLower;
      
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    return unique.slice(0, count);
  }

  async getMovesForPokemon(pokemonId: number, maxGen: number): Promise<Move[]> {
    const validVersionIds = await getValidVersionIds(maxGen);
    if (validVersionIds.length === 0) return [];

    // Get this Pokemon + its pre-evolutions
    const pokemonWithPreEvos = await this.getPokemonWithPreEvolutions(pokemonId);
    console.log(`[getMovesForPokemon] Pokemon ${pokemonId} with pre-evolutions:`, pokemonWithPreEvos);

    // Get moves for this Pokemon AND its pre-evolutions
    const result = await db.selectDistinct({
        moveId: moves.id,
        moveName: moves.name,
        moveType: moves.type,
        movePower: moves.power,
        moveAccuracy: moves.accuracy,
        movePp: moves.pp,
        moveGenId: moves.generationId
      })
      .from(pokemonMoves)
      .innerJoin(moves, eq(moves.id, pokemonMoves.moveId))
      .where(and(
        inArray(pokemonMoves.pokemonId, pokemonWithPreEvos),
        inArray(pokemonMoves.versionGroupId, validVersionIds)
      ));
    
    console.log(`[getMovesForPokemon] Found ${result.length} moves for Pokemon ${pokemonId}`);
    
    // Map to Move objects
    return result.map(row => ({
      id: row.moveId,
      name: row.moveName,
      type: row.moveType,
      power: row.movePower,
      accuracy: row.moveAccuracy,
      pp: row.movePp,
      generationId: row.moveGenId
    }));
  }

  async checkUniqueMoveset(moveIds: number[], pokemonId: number, maxGen: number): Promise<boolean> {
    if (moveIds.length === 0) return false;

    const validVersionIds = await getValidVersionIds(maxGen);
    if (validVersionIds.length === 0) return true;

    // Get target Pokemon info
    const [targetPokemon] = await db.select({
        id: pokemon.id,
        speciesName: pokemon.speciesName
      })
      .from(pokemon)
      .where(eq(pokemon.id, pokemonId));
    
    if (!targetPokemon) return true;
    
    const targetSpeciesBase = targetPokemon.speciesName.split('-')[0];
    
    // FAST APPROACH: Only check for direct learners
    // This is much faster and still catches most duplicates
    const directLearners = await db.select({ 
        pokemonId: pokemonMoves.pokemonId
      })
      .from(pokemonMoves)
      .innerJoin(pokemon, eq(pokemonMoves.pokemonId, pokemon.id))
      .where(and(
        inArray(pokemonMoves.moveId, moveIds),
        inArray(pokemonMoves.versionGroupId, validVersionIds),
        lte(pokemon.generationId, maxGen),
        sql`${pokemon.speciesName} NOT LIKE ${targetSpeciesBase + '%'}` // Exclude same species
      ))
      .groupBy(pokemonMoves.pokemonId)
      .having(sql`count(distinct ${pokemonMoves.moveId}) = ${moveIds.length}`);
    
    // If we found direct learners, not unique
    return directLearners.length === 0;
  }

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

  async seedEvolutions(data: any[]) {
    console.log(`seedEvolutions called with ${data.length} items`);
    if (data.length === 0) {
      console.log("⚠ No evolution data to seed");
      return;
    }
    console.log("First evolution to insert:", JSON.stringify(data[0], null, 2));
    try {
      const result = await db.insert(evolutions).values(data).onConflictDoNothing();
      console.log(`✓ Successfully inserted evolutions into database`);
    } catch (error) {
      console.error("✗ Error inserting evolutions:", error);
      throw error;
    }
  }

  async getEvolutionChain(speciesId: number): Promise<number[]> {
    // Get all Pokemon in the evolution chain (both pre-evolutions and evolutions)
    const chain = new Set<number>([speciesId]);
    
    // Helper to recursively get pre-evolutions (going backwards)
    const getPreEvolutions = async (id: number) => {
      const preEvos = await db.select()
        .from(evolutions)
        .where(eq(evolutions.evolvesIntoSpeciesId, id));
      
      for (const evo of preEvos) {
        if (!chain.has(evo.evolvedSpeciesId)) {
          chain.add(evo.evolvedSpeciesId);
          await getPreEvolutions(evo.evolvedSpeciesId);
        }
      }
    };
    
    // Helper to recursively get evolutions (going forwards)
    const getEvolutions = async (id: number) => {
      const evos = await db.select()
        .from(evolutions)
        .where(eq(evolutions.evolvedSpeciesId, id));
      
      for (const evo of evos) {
        if (!chain.has(evo.evolvesIntoSpeciesId)) {
          chain.add(evo.evolvesIntoSpeciesId);
          await getEvolutions(evo.evolvesIntoSpeciesId);
        }
      }
    };
    
    // Get all pre-evolutions (going backwards in the chain)
    await getPreEvolutions(speciesId);
    
    // Get all evolutions (going forwards in the chain)
    await getEvolutions(speciesId);
    
    return Array.from(chain);
  }

  async getPokemonWithPreEvolutions(pokemonId: number): Promise<number[]> {
    // Get only this Pokemon and its direct pre-evolutions (NOT sibling evolutions)
    // Example: Flareon should get Eevee, but NOT Vaporeon/Jolteon/etc.
    
    const result = [pokemonId];
    const visited = new Set<number>([pokemonId]);
    const queue = [pokemonId];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      
      // Find what this Pokemon evolved FROM (pre-evolution)
      // We look for rows where evolvesIntoSpeciesId = currentId (this Pokemon is the result)
      // This gives us the evolvedSpeciesId (the pre-evolution)
      const preEvos = await db.select({
        preEvolutionId: evolutions.evolvedSpeciesId,
        speciesName: pokemon.speciesName
      })
      .from(evolutions)
      .innerJoin(pokemon, eq(evolutions.evolvedSpeciesId, pokemon.id))
      .where(eq(evolutions.evolvesIntoSpeciesId, currentId));
      
      for (const preEvo of preEvos) {
        // Filter out cosmetic forms
        const speciesName = preEvo.speciesName;
        const isCosmeticForm = 
          speciesName.includes('-cap') ||
          speciesName.includes('-original') ||
          speciesName.includes('-hoenn') ||
          speciesName.includes('-sinnoh') ||
          speciesName.includes('-unova') ||
          speciesName.includes('-kalos') ||
          speciesName.includes('-alola') ||
          speciesName.includes('-partner') ||
          speciesName.includes('-world');
        
        if (!isCosmeticForm && !visited.has(preEvo.preEvolutionId)) {
          visited.add(preEvo.preEvolutionId);
          result.push(preEvo.preEvolutionId);
          queue.push(preEvo.preEvolutionId);
        }
      }
    }
    
    return result;
  }

  async getFullEvolutionFamily(speciesId: number): Promise<number[]> {
    // Get the complete evolution family (pre-evolutions + this Pokemon + future evolutions)
    const chain = new Set<number>([speciesId]);
    
    // Helper to recursively get pre-evolutions (going backwards)
    const getPreEvolutions = async (id: number) => {
      const preEvos = await db.select()
        .from(evolutions)
        .where(eq(evolutions.evolvesIntoSpeciesId, id));
      
      for (const evo of preEvos) {
        if (!chain.has(evo.evolvedSpeciesId)) {
          chain.add(evo.evolvedSpeciesId);
          await getPreEvolutions(evo.evolvedSpeciesId);
        }
      }
    };
    
    // Helper to recursively get future evolutions (going forwards)
    const getFutureEvolutions = async (id: number) => {
      const futureEvos = await db.select()
        .from(evolutions)
        .where(eq(evolutions.evolvedSpeciesId, id));
      
      for (const evo of futureEvos) {
        if (!chain.has(evo.evolvesIntoSpeciesId)) {
          chain.add(evo.evolvesIntoSpeciesId);
          await getFutureEvolutions(evo.evolvesIntoSpeciesId);
        }
      }
    };
    
    // Get all pre-evolutions and future evolutions
    await getPreEvolutions(speciesId);
    await getFutureEvolutions(speciesId);
    
    // Filter to only include default forms
    const allPokemonInChain = await db.select({
      id: pokemon.id,
      speciesName: pokemon.speciesName
    })
    .from(pokemon)
    .where(inArray(pokemon.id, Array.from(chain)));
    
    // Keep only default forms or forms that don't have cosmetic variants
    const defaultFormIds = allPokemonInChain
      .filter(p => 
        p.speciesName.includes('default') || 
        !p.speciesName.match(/-(?:rock-star|belle|pop-star|phd|libre|original-cap|hoenn-cap|sinnoh-cap|unova-cap|kalos-cap|alola-cap|partner-cap|world-cap)/)
      )
      .map(p => p.id);
    
    return defaultFormIds;
  }

  async areSameSpeciesOrCosmeticForm(pokemonId1: number, pokemonId2: number): Promise<boolean> {
    // Check if two Pokemon are the same species (e.g., Castform base and Castform Rainy)
    const [p1] = await db.select().from(pokemon).where(eq(pokemon.id, pokemonId1));
    const [p2] = await db.select().from(pokemon).where(eq(pokemon.id, pokemonId2));
    
    if (!p1 || !p2) return false;
    
    // Same species name means they're forms of the same Pokemon
    return p1.speciesName === p2.speciesName;
  }

  async isSeeded(): Promise<boolean> {
    const [g] = await db.select().from(generations).limit(1);
    return !!g;
  }
}

export const storage = new DatabaseStorage();
