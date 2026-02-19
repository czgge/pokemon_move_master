import { db } from "../server/db";
import { pokemon, moves, pokemonMoves, evolutions } from "../shared/schema";
import { eq, lte, sql, and, inArray } from "drizzle-orm";
import fs from "fs";
import path from "path";

// Get valid version IDs for a generation
async function getValidVersionIds(maxGen: number): Promise<number[]> {
  const versions = await db.query.versions.findMany({
    where: lte(db.query.versions.generationId, maxGen),
    columns: { versionGroupId: true }
  });
  return [...new Set(versions.map(v => v.versionGroupId))];
}

// Get Pokemon with their pre-evolutions (filtering cosmetic forms)
async function getPokemonWithPreEvolutions(pokemonId: number): Promise<number[]> {
  const result = [pokemonId];
  const visited = new Set<number>([pokemonId]);
  
  const queue = [pokemonId];
  
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    
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

// Get all moves a Pokemon can learn (including from pre-evolutions)
async function getMovesForPokemon(pokemonId: number, maxGen: number): Promise<number[]> {
  const validVersionIds = await getValidVersionIds(maxGen);
  const pokemonWithPreEvos = await getPokemonWithPreEvolutions(pokemonId);
  
  const pokemonMovesList = await db.selectDistinct({ moveId: pokemonMoves.moveId })
    .from(pokemonMoves)
    .where(and(
      inArray(pokemonMoves.pokemonId, pokemonWithPreEvos),
      inArray(pokemonMoves.versionGroupId, validVersionIds)
    ));
  
  return pokemonMovesList.map(m => m.moveId);
}

// Check if a moveset is unique for a Pokemon
async function isUniqueMoveset(
  moveIds: number[], 
  pokemonId: number, 
  maxGen: number,
  allPokemonMoves: Map<number, Set<number>>
): Promise<boolean> {
  const targetMoveSet = new Set(moveIds);
  
  // Check all other Pokemon
  for (const [otherPokemonId, otherMoves] of allPokemonMoves.entries()) {
    if (otherPokemonId === pokemonId) continue;
    
    // Check if this Pokemon can learn all the moves
    const canLearnAll = moveIds.every(moveId => otherMoves.has(moveId));
    if (canLearnAll) {
      return false; // Not unique
    }
  }
  
  return true;
}

async function generatePuzzles() {
  console.log("Starting puzzle generation...");
  
  for (let gen = 1; gen <= 9; gen++) {
    console.log(`\nGenerating puzzles for Generation ${gen}...`);
    
    // Get all Pokemon up to this generation
    const allPokemon = await db.select({
      id: pokemon.id,
      ndexId: pokemon.ndexId,
      name: pokemon.name,
      speciesName: pokemon.speciesName,
      generationId: pokemon.generationId
    })
    .from(pokemon)
    .where(lte(pokemon.generationId, gen));
    
    console.log(`Found ${allPokemon.length} Pokemon`);
    
    // Filter out cosmetic forms
    const filteredPokemon = allPokemon.filter(p => {
      const name = p.speciesName;
      return !name.includes('-cap') &&
             !name.includes('-original') &&
             !name.includes('-hoenn') &&
             !name.includes('-sinnoh') &&
             !name.includes('-unova') &&
             !name.includes('-kalos') &&
             !name.includes('-alola') &&
             !name.includes('-partner') &&
             !name.includes('-world') &&
             !name.includes('-gigantamax') &&
             !name.includes('-totem');
    });
    
    console.log(`After filtering: ${filteredPokemon.length} Pokemon`);
    
    // Pre-load all moves for all Pokemon
    console.log("Pre-loading moves for all Pokemon...");
    const allPokemonMoves = new Map<number, Set<number>>();
    
    for (const pkmn of filteredPokemon) {
      const moveIds = await getMovesForPokemon(pkmn.id, gen);
      allPokemonMoves.set(pkmn.id, new Set(moveIds));
      
      if (filteredPokemon.indexOf(pkmn) % 100 === 0) {
        console.log(`Loaded moves for ${filteredPokemon.indexOf(pkmn)}/${filteredPokemon.length} Pokemon`);
      }
    }
    
    console.log("Generating unique puzzles...");
    const puzzles: Array<{
      pokemonId: number;
      pokemonName: string;
      ndexId: number;
      moveIds: string;
      generation: number;
    }> = [];
    
    let processed = 0;
    for (const pkmn of filteredPokemon) {
      const moveIds = Array.from(allPokemonMoves.get(pkmn.id) || []);
      
      if (moveIds.length < 4) continue;
      
      // Try to find up to 5 unique 4-move combinations for this Pokemon
      const attempts = Math.min(20, Math.floor(moveIds.length / 4));
      let foundPuzzles = 0;
      
      for (let i = 0; i < attempts && foundPuzzles < 5; i++) {
        // Randomly select 4 moves
        const shuffled = moveIds.sort(() => 0.5 - Math.random());
        const selectedMoves = shuffled.slice(0, 4);
        
        // Check if unique
        const isUnique = await isUniqueMoveset(selectedMoves, pkmn.id, gen, allPokemonMoves);
        
        if (isUnique) {
          puzzles.push({
            pokemonId: pkmn.id,
            pokemonName: pkmn.name,
            ndexId: pkmn.ndexId,
            moveIds: selectedMoves.join(','),
            generation: gen
          });
          foundPuzzles++;
        }
      }
      
      processed++;
      if (processed % 50 === 0) {
        console.log(`Processed ${processed}/${filteredPokemon.length} Pokemon, found ${puzzles.length} puzzles`);
      }
    }
    
    console.log(`Generated ${puzzles.length} unique puzzles for Gen ${gen}`);
    
    // Write to CSV
    const csvPath = path.join(__dirname, `../data/puzzles-gen${gen}.csv`);
    const csvHeader = "pokemonId,pokemonName,ndexId,moveIds,generation\n";
    const csvRows = puzzles.map(p => 
      `${p.pokemonId},${p.pokemonName},${p.ndexId},"${p.moveIds}",${p.generation}`
    ).join('\n');
    
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });
    fs.writeFileSync(csvPath, csvHeader + csvRows);
    
    console.log(`Saved to ${csvPath}`);
  }
  
  console.log("\nPuzzle generation complete!");
  process.exit(0);
}

generatePuzzles().catch(console.error);
