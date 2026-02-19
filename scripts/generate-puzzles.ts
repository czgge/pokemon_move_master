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

// Generate combinations of 4 moves from a list (limited version)
function* generateLimitedCombinations(moves: number[], size: number, maxCombos: number): Generator<number[]> {
  let count = 0;
  
  if (size === 0) {
    yield [];
    return;
  }
  
  for (let i = 0; i <= moves.length - size; i++) {
    if (count >= maxCombos) break;
    
    const move = moves[i];
    const remaining = moves.slice(i + 1);
    
    for (const combo of generateLimitedCombinations(remaining, size - 1, maxCombos - count)) {
      if (count >= maxCombos) break;
      yield [move, ...combo];
      count++;
    }
  }
}

// Check if a moveset is unique (no other Pokemon can learn all 4 moves)
function isUniqueMoveset(
  moveIds: number[],
  pokemonId: number,
  allPokemonMoves: Map<number, Set<number>>
): boolean {
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
    
    console.log("Generating unique puzzles (up to 10,000)...");
    const puzzles: Array<{
      pokemonId: number;
      pokemonName: string;
      ndexId: number;
      moveIds: string;
      generation: number;
    }> = [];
    
    const MAX_PUZZLES = 10000;
    let totalChecked = 0;
    
    // Process each Pokemon once, checking many combinations
    console.log("Processing Pokemon to find unique puzzles...");
    
    for (let i = 0; i < filteredPokemon.length && puzzles.length < MAX_PUZZLES; i++) {
      const pkmn = filteredPokemon[i];
      const moveIds = Array.from(allPokemonMoves.get(pkmn.id) || []);
      
      if (moveIds.length < 4) {
        console.log(`  ⚠ ${pkmn.name} has only ${moveIds.length} moves, skipping`);
        continue;
      }
      
      let foundForPokemon = 0;
      const maxPerPokemon = 50; // Allow up to 50 puzzles per Pokemon
      
      // Calculate total possible combinations for this Pokemon
      const totalPossible = (moveIds.length * (moveIds.length - 1) * (moveIds.length - 2) * (moveIds.length - 3)) / 24;
      
      // Check many combinations (up to 50,000 per Pokemon)
      const maxCombosToCheck = Math.min(50000, totalPossible);
      
      // Generate and check combinations
      for (const combo of generateLimitedCombinations(moveIds, 4, maxCombosToCheck)) {
        if (foundForPokemon >= maxPerPokemon) break;
        if (puzzles.length >= MAX_PUZZLES) break;
        
        totalChecked++;
        
        // Check if unique
        const isUnique = isUniqueMoveset(combo, pkmn.id, allPokemonMoves);
        
        if (isUnique) {
          const comboKey = combo.join(',');
          
          // Check if we already have this exact combination
          if (puzzles.some(p => p.moveIds === comboKey)) continue;
          
          puzzles.push({
            pokemonId: pkmn.id,
            pokemonName: pkmn.name,
            ndexId: pkmn.ndexId,
            moveIds: comboKey,
            generation: gen
          });
          
          foundForPokemon++;
        }
        
        // Progress update
        if (totalChecked % 10000 === 0) {
          console.log(`  [${i + 1}/${filteredPokemon.length}] Checked ${totalChecked} combos, found ${puzzles.length} unique`);
        }
      }
      
      if (foundForPokemon > 0) {
        console.log(`  ✓ ${pkmn.name}: Found ${foundForPokemon} unique puzzles`);
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
