// Generate ALL possible unique puzzle combinations
// This script generates every possible 4-move combination that is unique
// WARNING: This can take several hours and generate large files

import { db } from "../server/db";
import { pokemon, moves, pokemonMoves, evolutions } from "../shared/schema";
import { eq, lte, sql, and, inArray } from "drizzle-orm";
import fs from "fs";
import path from "path";

// Get valid version IDs for a generation
async function getValidVersionIds(maxGen: number): Promise<number[]> {
  const versions = await db.query.versions.findMany({
    where: (versions, { lte }) => lte(versions.generationId, maxGen),
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

// Generate all combinations of 4 moves from a list
function* generateCombinations(moves: number[], size: number): Generator<number[]> {
  if (size === 0) {
    yield [];
    return;
  }
  
  for (let i = 0; i <= moves.length - size; i++) {
    const move = moves[i];
    const remaining = moves.slice(i + 1);
    
    for (const combo of generateCombinations(remaining, size - 1)) {
      yield [move, ...combo];
    }
  }
}

// Check if a moveset is unique (no other Pokemon can learn all 4 moves)
async function isUniqueMoveset(
  moveIds: number[],
  pokemonId: number,
  maxGen: number,
  allPokemonMoves: Map<number, Set<number>>
): Promise<boolean> {
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

async function generateAllPuzzles(gen: number) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`GENERATING ALL UNIQUE PUZZLES FOR GEN ${gen}`);
  console.log(`${'='.repeat(60)}\n`);
  
  const startTime = Date.now();
  
  // Get all Pokemon up to this generation
  const allPokemon = await db.select({
    id: pokemon.id,
    name: pokemon.name,
    ndexId: pokemon.ndexId,
    speciesName: pokemon.speciesName
  })
  .from(pokemon)
  .where(lte(pokemon.generationId, gen));
  
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
  
  console.log(`Found ${filteredPokemon.length} Pokemon for Gen ${gen}`);
  
  // Pre-load all moves for all Pokemon (including pre-evolutions)
  console.log("Pre-loading moves for all Pokemon (including pre-evolutions)...");
  const allPokemonMoves = new Map<number, Set<number>>();
  const validVersionIds = await getValidVersionIds(gen);
  
  for (let i = 0; i < filteredPokemon.length; i++) {
    const pkmn = filteredPokemon[i];
    
    // Get Pokemon + pre-evolutions
    const pokemonWithPreEvos = await getPokemonWithPreEvolutions(pkmn.id);
    
    // Get all moves
    const pokemonMovesList = await db.selectDistinct({ moveId: pokemonMoves.moveId })
      .from(pokemonMoves)
      .where(and(
        inArray(pokemonMoves.pokemonId, pokemonWithPreEvos),
        inArray(pokemonMoves.versionGroupId, validVersionIds)
      ));
    
    allPokemonMoves.set(pkmn.id, new Set(pokemonMovesList.map(m => m.moveId)));
    
    if ((i + 1) % 50 === 0) {
      console.log(`  Loaded moves for ${i + 1}/${filteredPokemon.length} Pokemon`);
    }
  }
  
  console.log(`✓ Loaded moves for all ${filteredPokemon.length} Pokemon\n`);
  
  // Generate all unique puzzles
  console.log("Generating all unique 4-move combinations...");
  const puzzles: Array<{
    pokemonId: number;
    pokemonName: string;
    ndexId: number;
    moveIds: string;
    generation: number;
  }> = [];
  
  let totalCombinations = 0;
  let uniqueCombinations = 0;
  
  for (let i = 0; i < filteredPokemon.length; i++) {
    const pkmn = filteredPokemon[i];
    const moveIds = Array.from(allPokemonMoves.get(pkmn.id) || []);
    
    if (moveIds.length < 4) {
      console.log(`  ⚠ ${pkmn.name} has only ${moveIds.length} moves, skipping`);
      continue;
    }
    
    const pokemonStartTime = Date.now();
    let pokemonCombos = 0;
    let pokemonUnique = 0;
    
    // Generate all 4-move combinations
    for (const combo of generateCombinations(moveIds, 4)) {
      totalCombinations++;
      pokemonCombos++;
      
      // Check if unique
      const isUnique = await isUniqueMoveset(combo, pkmn.id, gen, allPokemonMoves);
      
      if (isUnique) {
        uniqueCombinations++;
        pokemonUnique++;
        
        puzzles.push({
          pokemonId: pkmn.id,
          pokemonName: pkmn.name,
          ndexId: pkmn.ndexId,
          moveIds: combo.join(','),
          generation: gen
        });
      }
      
      // Progress update every 1000 combinations
      if (totalCombinations % 1000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        console.log(`  [${elapsed}m] Checked ${totalCombinations} combos, found ${uniqueCombinations} unique`);
      }
    }
    
    const pokemonTime = ((Date.now() - pokemonStartTime) / 1000).toFixed(1);
    console.log(`  ✓ ${pkmn.name}: ${pokemonUnique}/${pokemonCombos} unique (${pokemonTime}s)`);
  }
  
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`GENERATION COMPLETE!`);
  console.log(`  Total combinations checked: ${totalCombinations.toLocaleString()}`);
  console.log(`  Unique puzzles found: ${uniqueCombinations.toLocaleString()}`);
  console.log(`  Time elapsed: ${totalTime} minutes`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Write to CSV
  const csvPath = path.join(process.cwd(), 'data', `puzzles-gen${gen}-complete.csv`);
  const csvHeader = "pokemonId,pokemonName,ndexId,moveIds,generation\n";
  const csvRows = puzzles.map(p => 
    `${p.pokemonId},${p.pokemonName},${p.ndexId},"${p.moveIds}",${p.generation}`
  ).join('\n');
  
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, csvHeader + csvRows);
  
  const fileSize = (fs.statSync(csvPath).size / 1024 / 1024).toFixed(2);
  console.log(`✓ Saved to ${csvPath} (${fileSize} MB)`);
  
  return puzzles.length;
}

async function main() {
  const args = process.argv.slice(2);
  const targetGen = args[0] ? parseInt(args[0]) : null;
  
  if (targetGen) {
    // Generate for specific generation
    if (targetGen < 1 || targetGen > 9) {
      console.error("Invalid generation. Use 1-9.");
      process.exit(1);
    }
    
    await generateAllPuzzles(targetGen);
  } else {
    // Generate for all generations
    console.log("Generating ALL puzzles for ALL generations (1-9)");
    console.log("This will take several hours. Press Ctrl+C to cancel.\n");
    
    for (let gen = 1; gen <= 9; gen++) {
      await generateAllPuzzles(gen);
    }
    
    console.log("\n🎉 ALL GENERATIONS COMPLETE!");
  }
  
  process.exit(0);
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
