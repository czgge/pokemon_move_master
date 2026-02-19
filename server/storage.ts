
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
    // Search and deduplicate cosmetic forms only
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
        .limit(50);
      
      console.log(`[searchPokemonForGame] Found ${results.length} raw results`);
      if (results.length > 0) {
        console.log(`[searchPokemonForGame] First result: ${results[0].name}, speciesName: ${results[0].speciesName}`);
      }
      
      // DEFINITIVE list of purely cosmetic forms (100% same moveset)
      // Only including Pokemon where ALL forms share the EXACT same moveset
      const cosmeticSuffixes = [
        // Unown - 28 forms, all identical moveset (only Hidden Power) - keep only default
        '-a', '-b', '-c', '-d', '-e', '-f', '-g', '-h', '-i', '-j', '-k', '-l', '-m',
        '-n', '-o', '-p', '-q', '-r', '-s', '-t', '-u', '-v', '-w', '-x', '-y', '-z',
        '-exclamation', '-question',
        
        // Castform - weather forms, same moveset
        // NOTE: Excluding '-default' from this list because Tapu Pokemon use it but are NOT cosmetic
        '-sunny', '-rainy', '-snowy',
        
        // Burmy - cloak forms, same moveset (Wormadam has DIFFERENT moves and should NOT be deduplicated)
        '-plant-cloak', '-sandy-cloak', '-trash-cloak',
        
        // Cherrim - form changes in battle but same moveset
        '-overcast', '-sunshine',
        
        // Shellos/Gastrodon - sea forms, same moveset
        '-west-sea', '-east-sea',
        
        // Arceus - type plates, all same moveset (Judgment changes type but moveset is identical)
        '-normal', '-fighting', '-flying', '-poison', '-ground', '-rock', '-bug', '-ghost',
        '-steel', '-fire', '-water', '-grass', '-electric', '-psychic', '-ice', '-dragon',
        '-dark', '-fairy',
        
        // Basculin - stripe forms, same moveset (White-Striped has different evolution but same moves)
        '-red-stripe', '-blue-stripe', '-white-stripe',
        
        // Deerling/Sawsbuck - seasonal forms, same moveset
        '-spring', '-summer', '-autumn', '-winter',
        
        // Vivillon - pattern forms, all same moveset
        '-meadow', '-icy-snow', '-polar', '-tundra', '-continental', '-garden', '-elegant',
        '-modern', '-marine', '-archipelago', '-high-plains', '-sandstorm', '-river',
        '-monsoon', '-savanna', '-sun', '-ocean', '-jungle', '-fancy', '-poke-ball',
        
        // Flabébé/Floette/Florges - flower colors, same moveset
        '-red', '-yellow', '-orange', '-blue', '-white',
        
        // Furfrou - trim forms, all same moveset
        '-natural', '-heart', '-star', '-diamond', '-debutante', '-matron', '-dandy',
        '-lareine', '-kabuki', '-pharaoh',
        
        // Pumpkaboo/Gourgeist - size forms (different stats but same moveset)
        '-average', '-small', '-large', '-super',
        
        // Xerneas - mode forms (just visual)
        '-neutral', '-active',
        
        // Silvally - memory forms, all same moveset (Multi-Attack changes type but moveset identical)
        '-fighting-memory', '-flying-memory', '-poison-memory', '-ground-memory',
        '-rock-memory', '-bug-memory', '-ghost-memory', '-steel-memory', '-fire-memory',
        '-water-memory', '-grass-memory', '-electric-memory', '-psychic-memory',
        '-ice-memory', '-dragon-memory', '-dark-memory', '-fairy-memory',
        
        // Minior - core colors + meteor, all same moveset
        '-red-core', '-orange-core', '-yellow-core', '-green-core', '-blue-core',
        '-indigo-core', '-violet-core', '-meteor', '-red-meteor',
        
        // Sinistea/Polteageist - authenticity (just visual)
        '-phony', '-antique',
        
        // Alcremie - cream variants, all same moveset
        '-vanilla-cream', '-ruby-cream', '-matcha-cream', '-mint-cream', '-lemon-cream',
        '-salted-cream', '-ruby-swirl', '-caramel-swirl', '-rainbow-swirl',
        
        // Maushold - family size (just visual)
        '-family-of-three', '-family-of-four',
        
        // Squawkabilly - plumage colors, same moveset
        '-green', '-blue', '-yellow', '-white',
        
        // Dudunsparce - segment count (just visual)
        '-two-segment', '-three-segment',
        
        // Poltchageist/Sinistcha - authenticity (just visual)
        '-counterfeit', '-artisan',
        
        // Pikachu - cosmetic forms (caps, costumes)
        '-pop-star', '-rock-star', '-belle', '-phd', '-libre',
        '-original-cap', '-hoenn-cap', '-sinnoh-cap', '-unova-cap', '-kalos-cap',
        '-alola-cap', '-partner-cap', '-world-cap',
        
        // Koraidon - build forms, same moveset (just visual/functional changes for traversal)
        '-apex', '-limited', '-sprinting', '-swimming', '-gliding',
        
        // Miraidon - mode forms, same moveset (just visual/functional changes for traversal)
        '-ultimate', '-low-power', '-drive', '-aquatic', '-glide',
        
        // Totem forms - same moveset as base forms, just larger size
        '-totem', '-alolan-totem',
      ];
      
      // Deduplicate: keep only base forms for cosmetic variants
      const uniqueMap = new Map<string, Pokemon>();
      for (const p of results) {
        const speciesLower = p.speciesName.toLowerCase();
        
        // Check if this is a cosmetic form
        const isCosmeticForm = cosmeticSuffixes.some(suffix => speciesLower.endsWith(suffix));
        
        // For cosmetic forms, use base name as key; otherwise use full species name
        const key = isCosmeticForm 
          ? speciesLower.split('-')[0] // Base name only
          : speciesLower; // Full name (keeps Mega, Alolan, etc.)
        
        if (!uniqueMap.has(key)) {
          // Clean the display name for cosmetic forms
          let cleanedPokemon = p;
          if (isCosmeticForm) {
            // Extract base name from speciesName (e.g., "sawsbuck-spring" -> "sawsbuck")
            const baseName = p.speciesName.split('-')[0];
            // Capitalize first letter
            const displayName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
            cleanedPokemon = {
              ...p,
              name: displayName
            };
          }
          
          uniqueMap.set(key, cleanedPokemon);
        } else {
          // If we already have an entry, prefer "default" form if this is one
          const existing = uniqueMap.get(key)!;
          if (speciesLower.includes('-default') && !existing.speciesName.toLowerCase().includes('-default')) {
            // Extract base name from speciesName
            const baseName = p.speciesName.split('-')[0];
            const displayName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
            uniqueMap.set(key, {
              ...p,
              name: displayName
            });
          }
        }
      }
      
      const finalResults = Array.from(uniqueMap.values()).slice(0, 20);
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
      // We look for rows where evolvedPokemonId = currentId
      // This gives us the preEvolutionPokemonId
      const preEvos = await db.select({
        preEvolutionPokemonId: evolutions.preEvolutionPokemonId,
        speciesName: pokemon.speciesName
      })
      .from(evolutions)
      .innerJoin(pokemon, eq(evolutions.preEvolutionPokemonId, pokemon.id))
      .where(eq(evolutions.evolvedPokemonId, currentId));
      
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
        
        if (!isCosmeticForm && !visited.has(preEvo.preEvolutionPokemonId)) {
          visited.add(preEvo.preEvolutionPokemonId);
          result.push(preEvo.preEvolutionPokemonId);
          queue.push(preEvo.preEvolutionPokemonId);
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
