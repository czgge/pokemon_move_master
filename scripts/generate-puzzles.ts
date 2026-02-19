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
    
    const MIN_PUZZLES_PER_GEN = 10000;
    const pokemonPuzzleCount = new Map<number, number>();
    const pokemonHasUnique = new Set<number>();
    
    // Phase 1: Ensure every Pokemon gets at least 1 unique puzzle
    console.log("Phase 1: Ensuring all Pokemon are represented...");
    const shuffledPokemon = [...filteredPokemon].sort(() => 0.5 - Math.random());
    
    for (const pkmn of shuffledPokemon) {
      const moveIds = Array.from(allPokemonMoves.get(pkmn.id) || []);
      if (moveIds.length < 4) continue;
      
      // Try to find at least 1 unique combination
      const attempts = 20;
      for (let i = 0; i < attempts; i++) {
        const shuffled = [...moveIds].sort(() => 0.5 - Math.random());
        const selectedMoves = shuffled.slice(0, 4);
        const comboKey = selectedMoves.sort((a, b) => a - b).join(',');
        
        if (puzzles.some(p => p.moveIds === comboKey)) continue;
        
        const isUnique = await isUniqueMoveset(selectedMoves, pkmn.id, gen, allPokemonMoves);
        
        if (isUnique) {
          puzzles.push({
            pokemonId: pkmn.id,
            pokemonName: pkmn.name,
            ndexId: pkmn.ndexId,
            moveIds: comboKey,
            generation: gen
          });
          
          pokemonPuzzleCount.set(pkmn.id, 1);
          pokemonHasUnique.add(pkmn.id);
          break;
        }
      }
      
      if ((shuffledPokemon.indexOf(pkmn) + 1) % 50 === 0) {
        console.log(`  Processed ${shuffledPokemon.indexOf(pkmn) + 1}/${shuffledPokemon.length} Pokemon, found ${puzzles.length} puzzles`);
      }
    }
    
    console.log(`Phase 1 complete: ${puzzles.length} puzzles (${pokemonHasUnique.size} Pokemon represented)`);
    
    // Phase 2: Fill up to MIN_PUZZLES_PER_GEN, prioritizing Pokemon with fewer puzzles
    console.log(`Phase 2: Filling to ${MIN_PUZZLES_PER_GEN} puzzles...`);
    let rounds = 0;
    const maxRounds = 50;
    
    while (puzzles.length < MIN_PUZZLES_PER_GEN && rounds < maxRounds) {
      rounds++;
      
      // Sort Pokemon by puzzle count (ascending) to prioritize those with fewer puzzles
      const sortedPokemon = [...filteredPokemon].sort((a, b) => {
        const countA = pokemonPuzzleCount.get(a.id) || 0;
        const countB = pokemonPuzzleCount.get(b.id) || 0;
        return countA - countB;
      });
      
      let addedThisRound = 0;
      
      for (const pkmn of sortedPokemon) {
        if (puzzles.length >= MIN_PUZZLES_PER_GEN) break;
        
        const moveIds = Array.from(allPokemonMoves.get(pkmn.id) || []);
        if (moveIds.length < 4) continue;
        
        // Try to find a new unique combination
        const attempts = 15;
        for (let i = 0; i < attempts; i++) {
          const shuffled = [...moveIds].sort(() => 0.5 - Math.random());
          const selectedMoves = shuffled.slice(0, 4);
          const comboKey = selectedMoves.sort((a, b) => a - b).join(',');
          
          if (puzzles.some(p => p.moveIds === comboKey)) continue;
          
          const isUnique = await isUniqueMoveset(selectedMoves, pkmn.id, gen, allPokemonMoves);
          
          if (isUnique) {
            puzzles.push({
              pokemonId: pkmn.id,
              pokemonName: pkmn.name,
              ndexId: pkmn.ndexId,
              moveIds: comboKey,
              generation: gen
            });
            
            const currentCount = pokemonPuzzleCount.get(pkmn.id) || 0;
            pokemonPuzzleCount.set(pkmn.id, currentCount + 1);
            addedThisRound++;
            break;
          }
        }
      }
      
      console.log(`  Round ${rounds}: Added ${addedThisRound} puzzles (total: ${puzzles.length}/${MIN_PUZZLES_PER_GEN})`);
      
      if (addedThisRound === 0) {
        console.log(`  No new puzzles found, stopping early`);
        break;
      }
    }
    
    console.log(`Generated ${puzzles.length} unique puzzles for Gen ${gen}`);
    
    // Show distribution statistics
    const distribution = new Map<number, number>();
    for (const puzzle of puzzles) {
      const count = distribution.get(puzzle.pokemonId) || 0;
      distribution.set(puzzle.pokemonId, count + 1);
    }
    
    const pokemonWithPuzzles = distribution.size;
    const avgPuzzlesPerPokemon = (puzzles.length / pokemonWithPuzzles).toFixed(1);
    const maxPuzzles = Math.max(...Array.from(distribution.values()));
    const minPuzzles = Math.min(...Array.from(distribution.values()));
    
    console.log(`\nDistribution stats:`);
    console.log(`  Pokemon with puzzles: ${pokemonWithPuzzles}/${filteredPokemon.length}`);
    console.log(`  Average puzzles per Pokemon: ${avgPuzzlesPerPokemon}`);
    console.log(`  Min puzzles for a Pokemon: ${minPuzzles}`);
    console.log(`  Max puzzles for a Pokemon: ${maxPuzzles}`);
    
    // Write to CSV
    const csvPath = path.join(__dirname, `../data/puzzles-gen${gen}.csv`);
    const csvHeader = "pokemonId,pokemonName,ndexId,moveIds,generation\n";
    const csvRows = puzzles.map(p => 
      `${p.pokemonId},${p.pokemonName},${p.ndexId},"${p.moveIds}",${p.generation}`
    ).join('\n');
    
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });
    fs.writeFileSync(csvPath, csvHeader + csvRows);
    
    const fileSize = (fs.statSync(csvPath).size / 1024).toFixed(2);
    console.log(`\nSaved to ${csvPath} (${fileSize} KB)`);
  }
  
  console.log("\nPuzzle generation complete!");
  process.exit(0);
}

generatePuzzles().catch(console.error);
