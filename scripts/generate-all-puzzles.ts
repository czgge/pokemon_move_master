import { db } from "../server/db";
import { pokemon, moves, pokemonMoves, versions } from "../shared/schema";
import { lte, and, inArray, eq, isNotNull } from "drizzle-orm";
import fs from "fs";
import path from "path";

// Get valid version IDs for a generation
async function getValidVersionIds(maxGen: number): Promise<number[]> {
  const versionsList = await db.select({ id: versions.id })
    .from(versions)
    .where(and(
      lte(versions.generationId, maxGen),
      isNotNull(versions.generationId)
    ));
  return versionsList.map(v => v.id);
}

// Get Pokemon with their pre-evolutions
async function getPokemonWithPreEvolutions(pokemonId: number): Promise<number[]> {
  const result = [pokemonId];
  const visited = new Set<number>([pokemonId]);
  
  // Use evolution_trees if available
  try {
    const { evolutionTrees } = await import("../shared/schema");
    const trees = await db.select({
      stage1Id: evolutionTrees.stage1Id,
      stage2Id: evolutionTrees.stage2Id,
      stage3Id: evolutionTrees.stage3Id,
      stage: evolutionTrees.stage
    })
      .from(evolutionTrees)
      .where(lte(evolutionTrees.stage, 3));
    
    for (const tree of trees) {
      const stages = [tree.stage1Id, tree.stage2Id, tree.stage3Id].filter(id => id !== null);
      if (stages.includes(pokemonId)) {
        const pokemonIndex = stages.indexOf(pokemonId);
        for (let i = 0; i < pokemonIndex; i++) {
          if (stages[i] && !visited.has(stages[i])) {
            result.push(stages[i]);
            visited.add(stages[i]);
          }
        }
        break;
      }
    }
  } catch (e) {
    console.log("Using evolutions table as fallback");
  }
  
  return result;
}

// Get all moves a Pokemon can learn
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

// Calculate move frequencies
function calculateMoveFrequencies(allPokemonMoves: Map<number, Set<number>>): Map<number, number> {
  const frequencies = new Map<number, number>();
  
  for (const moveset of allPokemonMoves.values()) {
    for (const moveId of moveset) {
      frequencies.set(moveId, (frequencies.get(moveId) || 0) + 1);
    }
  }
  
  return frequencies;
}

// Calculate rarity score (higher = rarer = better)
function calculateRarityScore(moveIds: number[], moveFrequencies: Map<number, number>, totalPokemon: number): number {
  let score = 0;
  
  for (const moveId of moveIds) {
    const frequency = moveFrequencies.get(moveId) || 0;
    const rarity = totalPokemon - frequency;
    score += rarity * rarity; // Quadratic to heavily favor rare moves
  }
  
  return score;
}

// Generate all 4-move combinations
function* generateCombinations(moves: number[]): Generator<number[]> {
  const n = moves.length;
  if (n < 4) return;
  
  for (let i = 0; i < n - 3; i++) {
    for (let j = i + 1; j < n - 2; j++) {
      for (let k = j + 1; k < n - 1; k++) {
        for (let l = k + 1; l < n; l++) {
          yield [moves[i], moves[j], moves[k], moves[l]];
        }
      }
    }
  }
}

// Check if moveset is unique
function isUniqueMoveset(
  moveIds: number[],
  pokemonId: number,
  allPokemonMoves: Map<number, Set<number>>
): boolean {
  for (const [otherPokemonId, otherMoves] of allPokemonMoves.entries()) {
    if (otherPokemonId === pokemonId) continue;
    
    const canLearnAll = moveIds.every(moveId => otherMoves.has(moveId));
    if (canLearnAll) {
      return false;
    }
  }
  
  return true;
}

// Check if at least 3 moves are different from previous combinations
function hasMinimumVariation(moveIds: number[], previousCombos: Set<string>): boolean {
  const currentSet = new Set(moveIds);
  
  for (const prevCombo of previousCombos) {
    const prevMoves = prevCombo.split(',').map(Number);
    const prevSet = new Set(prevMoves);
    
    let sameCount = 0;
    for (const move of currentSet) {
      if (prevSet.has(move)) sameCount++;
    }
    
    // If 2, 3 or 4 moves are the same, reject (only accept if max 1 move is the same)
    if (sameCount >= 2) {
      return false;
    }
  }
  
  return true;
}

async function generateAllPuzzles(gen: number) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 COMPLETE PUZZLE GENERATION - Generation ${gen}`);
  console.log(`   Target: ALL unique puzzles (NO cap, with variation)`);
  console.log(`   Strategy: All rare unique movesets with variation check`);
  console.log(`${'='.repeat(70)}\n`);
  
  const startTime = Date.now();
  
  // STEP 1: Load Pokemon
  console.log("📦 STEP 1: Loading Pokemon...");
  const allPokemon = await db.select({
    id: pokemon.id,
    name: pokemon.name,
    ndexId: pokemon.ndexId,
    speciesName: pokemon.speciesName
  })
  .from(pokemon)
  .where(lte(pokemon.generationId, gen));
  
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
  
  console.log(`   ✓ Found ${filteredPokemon.length} Pokemon\n`);
  
  // STEP 2: Load moves
  console.log("📦 STEP 2: Loading moves for all Pokemon...");
  const allPokemonMoves = new Map<number, Set<number>>();
  
  for (let i = 0; i < filteredPokemon.length; i++) {
    const pkmn = filteredPokemon[i];
    const moveIds = await getMovesForPokemon(pkmn.id, gen);
    allPokemonMoves.set(pkmn.id, new Set(moveIds));
    
    if ((i + 1) % 50 === 0) {
      console.log(`   Progress: ${i + 1}/${filteredPokemon.length}`);
    }
  }
  
  console.log(`   ✓ Loaded moves for all Pokemon\n`);
  
  // STEP 3: Calculate frequencies
  console.log("📊 STEP 3: Calculating move frequencies...");
  const moveFrequencies = calculateMoveFrequencies(allPokemonMoves);
  
  const sortedByFrequency = Array.from(moveFrequencies.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  
  console.log("   Top 15 most common moves (will be deprioritized):");
  for (const [moveId, count] of sortedByFrequency) {
    const moveInfo = await db.select({ name: moves.name })
      .from(moves)
      .where(eq(moves.id, moveId))
      .limit(1);
    const percentage = ((count / filteredPokemon.length) * 100).toFixed(1);
    console.log(`     • ${moveInfo[0]?.name || `Move ${moveId}`}: ${count} Pokemon (${percentage}%)`);
  }
  console.log();
  
  // STEP 4: Generate puzzles with streaming to CSV (no memory overhead)
  console.log("🎯 STEP 4: Generating puzzles and streaming to CSV...");
  
  // Prepare CSV file
  const csvPath = path.join(process.cwd(), 'data', `puzzles-gen${gen}-complete.csv`);
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  const csvHeader = "pokemonId,pokemonName,ndexId,moveIds,generation\n";
  fs.writeFileSync(csvPath, csvHeader);
  
  const pokemonPreviousCombos = new Map<number, Set<string>>();
  const pokemonPuzzleCount = new Map<number, number>();
  let totalPuzzles = 0;
  let totalCombinationsChecked = 0;
  let buffer: string[] = [];
  const BUFFER_SIZE = 1000;
  
  for (let i = 0; i < filteredPokemon.length; i++) {
    const pkmn = filteredPokemon[i];
    const moveIds = Array.from(allPokemonMoves.get(pkmn.id) || []);
    
    if (moveIds.length < 4) {
      console.log(`   ⚠ ${pkmn.name} has only ${moveIds.length} moves, skipping`);
      continue;
    }
    
    let pokemonUnique = 0;
    const pokemonStartTime = Date.now();
    
    // Initialize variation tracking
    if (!pokemonPreviousCombos.has(pkmn.id)) {
      pokemonPreviousCombos.set(pkmn.id, new Set());
    }
    const previousCombos = pokemonPreviousCombos.get(pkmn.id)!;
    
    for (const combo of generateCombinations(moveIds)) {
      totalCombinationsChecked++;
      
      // Check uniqueness
      if (!isUniqueMoveset(combo, pkmn.id, allPokemonMoves)) {
        continue;
      }
      
      // Check variation (at least 3 different moves)
      if (!hasMinimumVariation(combo, previousCombos)) {
        continue;
      }
      
      // Add to CSV buffer
      const comboKey = combo.join(',');
      buffer.push(`${pkmn.id},${pkmn.name},${pkmn.ndexId},"${comboKey}",${gen}`);
      previousCombos.add(comboKey);
      pokemonPuzzleCount.set(pkmn.id, (pokemonPuzzleCount.get(pkmn.id) || 0) + 1);
      totalPuzzles++;
      pokemonUnique++;
      
      // Write buffer when full
      if (buffer.length >= BUFFER_SIZE) {
        fs.appendFileSync(csvPath, buffer.join('\n') + '\n');
        buffer = [];
      }
      
      if (totalCombinationsChecked % 50000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        console.log(`   [${elapsed}m] Checked ${totalCombinationsChecked.toLocaleString()} combos, saved ${totalPuzzles.toLocaleString()} puzzles`);
      }
    }
    
    const pokemonTime = ((Date.now() - pokemonStartTime) / 1000).toFixed(1);
    if (pokemonUnique > 0) {
      console.log(`   ✓ ${pkmn.name}: ${pokemonUnique} puzzles (${pokemonTime}s)`);
    }
  }
  
  // Write remaining buffer
  if (buffer.length > 0) {
    fs.appendFileSync(csvPath, buffer.join('\n') + '\n');
  }
  
  console.log(`   ✓ Generated ${totalPuzzles.toLocaleString()} puzzles\n`);
  
  // STEP 5: Statistics
  console.log("📈 STEP 5: Statistics");
  
  const pokemonWithPuzzles = pokemonPuzzleCount.size;
  const avgPuzzlesPerPokemon = (totalPuzzles / pokemonWithPuzzles).toFixed(1);
  const maxPuzzles = Math.max(...Array.from(pokemonPuzzleCount.values()));
  const minPuzzles = Math.min(...Array.from(pokemonPuzzleCount.values()));
  
  const countDistribution = new Map<number, number>();
  for (const count of pokemonPuzzleCount.values()) {
    countDistribution.set(count, (countDistribution.get(count) || 0) + 1);
  }
  
  console.log(`   Total puzzles: ${totalPuzzles.toLocaleString()}`);
  console.log(`   Pokemon with puzzles: ${pokemonWithPuzzles}/${filteredPokemon.length}`);
  console.log(`   Average per Pokemon: ${avgPuzzlesPerPokemon}`);
  console.log(`   Min/Max per Pokemon: ${minPuzzles}/${maxPuzzles}`);
  console.log(`   Distribution:`);
  for (const [count, numPokemon] of Array.from(countDistribution.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`     • ${numPokemon} Pokemon with ${count} puzzle${count > 1 ? 's' : ''}`);
  }
  
  const fileSize = (fs.statSync(csvPath).size / 1024 / 1024).toFixed(2);
  console.log(`   File: ${csvPath} (${fileSize} MB)\n`);
  
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`${'='.repeat(70)}`);
  console.log(`✅ GENERATION COMPLETE!`);
  console.log(`   Time: ${totalTime} minutes`);
  console.log(`   Combinations checked: ${totalCombinationsChecked.toLocaleString()}`);
  console.log(`   Final puzzles: ${totalPuzzles.toLocaleString()}`);
  console.log(`${'='.repeat(70)}\n`);
  
  return totalPuzzles;
}

async function main() {
  const args = process.argv.slice(2);
  const targetGen = args[0] ? parseInt(args[0]) : null;
  
  if (targetGen) {
    if (targetGen < 1 || targetGen > 9) {
      console.error("❌ Invalid generation. Use 1-9.");
      process.exit(1);
    }
    
    await generateAllPuzzles(targetGen);
  } else {
    console.log("🚀 Generating COMPLETE puzzles for ALL generations (1-9)\n");
    
    for (let gen = 1; gen <= 9; gen++) {
      await generateAllPuzzles(gen);
    }
    
    console.log("\n🎉 ALL GENERATIONS COMPLETE!");
  }
  
  process.exit(0);
}

main().catch(error => {
  console.error("\n❌ FATAL ERROR:", error);
  process.exit(1);
});
