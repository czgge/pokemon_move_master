import { db } from "../server/db";
import { pokemon, moves, pokemonMoves, versions } from "../shared/schema";
import { lte, and, inArray } from "drizzle-orm";
import fs from "fs";
import path from "path";

// Get valid version IDs for a generation
async function getValidVersionIds(maxGen: number): Promise<number[]> {
  const versionsList = await db.select({ versionGroupId: versions.versionGroupId })
    .from(versions)
    .where(lte(versions.generationId, maxGen));
  return [...new Set(versionsList.map(v => v.versionGroupId))];
}

// Get Pokemon with their pre-evolutions
async function getPokemonWithPreEvolutions(pokemonId: number): Promise<number[]> {
  const result = [pokemonId];
  const visited = new Set<number>([pokemonId]);
  
  // Use evolution_trees if available, otherwise fallback to evolutions table
  try {
    const { evolutionTrees } = await import("../shared/schema");
    const trees = await db.select()
      .from(evolutionTrees)
      .where(lte(evolutionTrees.stage, 3));
    
    // Find the tree containing this Pokemon
    for (const tree of trees) {
      const stages = [tree.stage1Id, tree.stage2Id, tree.stage3Id].filter(id => id !== null);
      if (stages.includes(pokemonId)) {
        // Add all Pokemon in this evolution line that come BEFORE this one
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
    // Fallback to evolutions table if evolution_trees doesn't exist
    console.log("Using evolutions table as fallback");
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

// Calculate how many Pokemon can learn each move
function calculateMoveFrequencies(allPokemonMoves: Map<number, Set<number>>): Map<number, number> {
  const frequencies = new Map<number, number>();
  
  for (const moveset of allPokemonMoves.values()) {
    for (const moveId of moveset) {
      frequencies.set(moveId, (frequencies.get(moveId) || 0) + 1);
    }
  }
  
  return frequencies;
}

// Calculate rarity score for a moveset (higher = better = rarer moves)
function calculateRarityScore(moveIds: number[], moveFrequencies: Map<number, number>, totalPokemon: number): number {
  let score = 0;
  
  for (const moveId of moveIds) {
    const frequency = moveFrequencies.get(moveId) || 0;
    // Rarity = how few Pokemon can learn this move
    // Score increases exponentially for rarer moves
    const rarity = totalPokemon - frequency;
    score += rarity * rarity; // Quadratic to heavily favor rare moves
  }
  
  return score;
}

// Generate all 4-move combinations from a moveset
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

// Check if a moveset is unique (no other Pokemon can learn all 4 moves)
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

// Check if at least 2 moves are different from previous combinations
function hasMinimumVariation(moveIds: number[], previousCombos: Set<string>): boolean {
  const currentSet = new Set(moveIds);
  
  for (const prevCombo of previousCombos) {
    const prevMoves = prevCombo.split(',').map(Number);
    const prevSet = new Set(prevMoves);
    
    let sameCount = 0;
    for (const move of currentSet) {
      if (prevSet.has(move)) sameCount++;
    }
    
    // If 3 or 4 moves are the same, reject
    if (sameCount >= 3) {
      return false;
    }
  }
  
  return true;
}

async function generatePuzzles() {
  const args = process.argv.slice(2);
  const genArg = args[0] || process.env.GENERATION;
  const targetGen = genArg ? parseInt(genArg) : null;
  
  if (!targetGen || targetGen < 1 || targetGen > 9) {
    console.error("❌ Invalid generation. Usage: tsx generate-puzzles.ts <generation>");
    console.error("   Example: tsx generate-puzzles.ts 3");
    process.exit(1);
  }
  
  const gen = targetGen;
  const MAX_PUZZLES = 10000;
  const MAX_PUZZLES_PER_POKEMON = 5; // Same as complete version
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 FAST PUZZLE GENERATION - Generation ${gen}`);
  console.log(`   Target: ${MAX_PUZZLES.toLocaleString()} puzzles (capped)`);
  console.log(`   Strategy: Rare moves + Pokemon distribution + variation`);
  console.log(`${'='.repeat(70)}\n`);
  
  const startTime = Date.now();
  
  // STEP 1: Load all Pokemon
  console.log("📦 STEP 1: Loading Pokemon...");
  const allPokemon = await db.select({
    id: pokemon.id,
    ndexId: pokemon.ndexId,
    name: pokemon.name,
    speciesName: pokemon.speciesName,
    generationId: pokemon.generationId
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
  
  console.log(`   ✓ Found ${filteredPokemon.length} Pokemon (filtered from ${allPokemon.length})\n`);
  
  // STEP 2: Pre-load all moves for all Pokemon
  console.log("📦 STEP 2: Loading moves for all Pokemon...");
  const allPokemonMoves = new Map<number, Set<number>>();
  
  for (let i = 0; i < filteredPokemon.length; i++) {
    const pkmn = filteredPokemon[i];
    const moveIds = await getMovesForPokemon(pkmn.id, gen);
    allPokemonMoves.set(pkmn.id, new Set(moveIds));
    
    if ((i + 1) % 100 === 0) {
      console.log(`   Progress: ${i + 1}/${filteredPokemon.length} Pokemon`);
    }
  }
  
  console.log(`   ✓ Loaded moves for all ${filteredPokemon.length} Pokemon\n`);
  
  // STEP 3: Calculate move frequencies
  console.log("📊 STEP 3: Calculating move frequencies...");
  const moveFrequencies = calculateMoveFrequencies(allPokemonMoves);
  
  // Show most common moves (these will be deprioritized)
  const sortedByFrequency = Array.from(moveFrequencies.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  
  console.log("   Top 15 most common moves (will be deprioritized):");
  for (const [moveId, count] of sortedByFrequency) {
    const moveInfo = await db.select({ name: moves.name })
      .from(moves)
      .where(lte(moves.id, moveId))
      .limit(1);
    const percentage = ((count / filteredPokemon.length) * 100).toFixed(1);
    console.log(`     • ${moveInfo[0]?.name || `Move ${moveId}`}: ${count} Pokemon (${percentage}%)`);
  }
  console.log();
  
  // STEP 4: Generate ALL unique puzzles with rarity scores
  console.log("🎯 STEP 4: Generating all unique puzzle candidates...");
  
  interface PuzzleCandidate {
    pokemonId: number;
    pokemonName: string;
    ndexId: number;
    moveIds: number[];
    rarityScore: number;
  }
  
  const allCandidates: PuzzleCandidate[] = [];
  let totalCombinationsChecked = 0;
  
  for (let i = 0; i < filteredPokemon.length; i++) {
    const pkmn = filteredPokemon[i];
    const moveIds = Array.from(allPokemonMoves.get(pkmn.id) || []);
    
    if (moveIds.length < 4) {
      console.log(`   ⚠ ${pkmn.name} has only ${moveIds.length} moves, skipping`);
      continue;
    }
    
    let pokemonUnique = 0;
    const pokemonStartTime = Date.now();
    
    // Generate all 4-move combinations for this Pokemon
    for (const combo of generateCombinations(moveIds)) {
      totalCombinationsChecked++;
      
      // Check if unique
      if (isUniqueMoveset(combo, pkmn.id, allPokemonMoves)) {
        const rarityScore = calculateRarityScore(combo, moveFrequencies, filteredPokemon.length);
        
        allCandidates.push({
          pokemonId: pkmn.id,
          pokemonName: pkmn.name,
          ndexId: pkmn.ndexId,
          moveIds: combo,
          rarityScore
        });
        
        pokemonUnique++;
      }
      
      // Progress update
      if (totalCombinationsChecked % 50000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   [${elapsed}s] Checked ${totalCombinationsChecked.toLocaleString()} combos, found ${allCandidates.length.toLocaleString()} unique`);
      }
    }
    
    const pokemonTime = ((Date.now() - pokemonStartTime) / 1000).toFixed(1);
    if ((i + 1) % 50 === 0 || pokemonUnique > 0) {
      console.log(`   ${pkmn.name}: ${pokemonUnique} unique puzzles (${pokemonTime}s)`);
    }
  }
  
  console.log(`   ✓ Found ${allCandidates.length.toLocaleString()} unique puzzle candidates\n`);
  
  // STEP 5: Sort by rarity score (highest = rarest = best)
  console.log("🔄 STEP 5: Sorting by rarity score...");
  allCandidates.sort((a, b) => b.rarityScore - a.rarityScore);
  console.log(`   ✓ Sorted ${allCandidates.length.toLocaleString()} candidates\n`);
  
  // STEP 6: Select puzzles with Pokemon distribution priority AND variation
  console.log("✨ STEP 6: Selecting puzzles (with variation + Pokemon diversity)...");
  
  const selectedPuzzles: Array<{
    pokemonId: number;
    pokemonName: string;
    ndexId: number;
    moveIds: string;
    generation: number;
  }> = [];
  
  const pokemonPuzzleCount = new Map<number, number>();
  const pokemonPreviousCombos = new Map<number, Set<string>>();
  const usedCombinations = new Set<string>();
  
  // Selection algorithm: prioritize Pokemon with fewer puzzles + ensure variation
  for (const candidate of allCandidates) {
    if (selectedPuzzles.length >= MAX_PUZZLES) break;
    
    const currentCount = pokemonPuzzleCount.get(candidate.pokemonId) || 0;
    const comboKey = candidate.moveIds.join(',');
    
    // Skip if already used this exact combination
    if (usedCombinations.has(comboKey)) continue;
    
    // Check variation for this Pokemon
    if (!pokemonPreviousCombos.has(candidate.pokemonId)) {
      pokemonPreviousCombos.set(candidate.pokemonId, new Set());
    }
    
    const previousCombos = pokemonPreviousCombos.get(candidate.pokemonId)!;
    
    // Check if at least 2 moves are different from previous combos
    if (!hasMinimumVariation(candidate.moveIds, previousCombos)) {
      continue;
    }
    
    // Check if we should skip this Pokemon (already has enough puzzles)
    if (currentCount >= MAX_PUZZLES_PER_POKEMON) {
      // Count how many Pokemon still have 0 puzzles
      const pokemonWithZeroPuzzles = allCandidates.filter(c => 
        (pokemonPuzzleCount.get(c.pokemonId) || 0) === 0 &&
        !usedCombinations.has(c.moveIds.join(','))
      ).length;
      
      // If there are Pokemon with 0 puzzles, skip this one
      if (pokemonWithZeroPuzzles > 0) {
        continue;
      }
    }
    
    // Add this puzzle
    selectedPuzzles.push({
      pokemonId: candidate.pokemonId,
      pokemonName: candidate.pokemonName,
      ndexId: candidate.ndexId,
      moveIds: comboKey,
      generation: gen
    });
    
    usedCombinations.add(comboKey);
    previousCombos.add(comboKey);
    pokemonPuzzleCount.set(candidate.pokemonId, currentCount + 1);
    
    if (selectedPuzzles.length % 1000 === 0) {
      const uniquePokemon = pokemonPuzzleCount.size;
      console.log(`   Progress: ${selectedPuzzles.length.toLocaleString()}/${MAX_PUZZLES.toLocaleString()} puzzles (${uniquePokemon} unique Pokemon)`);
    }
  }
  
  console.log(`   ✓ Selected ${selectedPuzzles.length.toLocaleString()} puzzles\n`);
  
  // STEP 7: Show statistics
  console.log("📈 STEP 7: Statistics");
  
  const distribution = new Map<number, number>();
  for (const puzzle of selectedPuzzles) {
    const count = distribution.get(puzzle.pokemonId) || 0;
    distribution.set(puzzle.pokemonId, count + 1);
  }
  
  const pokemonWithPuzzles = distribution.size;
  const avgPuzzlesPerPokemon = (selectedPuzzles.length / pokemonWithPuzzles).toFixed(1);
  const maxPuzzles = Math.max(...Array.from(distribution.values()));
  const minPuzzles = Math.min(...Array.from(distribution.values()));
  
  // Count Pokemon by puzzle count
  const countDistribution = new Map<number, number>();
  for (const count of distribution.values()) {
    countDistribution.set(count, (countDistribution.get(count) || 0) + 1);
  }
  
  console.log(`   Total puzzles: ${selectedPuzzles.length.toLocaleString()}`);
  console.log(`   Pokemon with puzzles: ${pokemonWithPuzzles}/${filteredPokemon.length}`);
  console.log(`   Average per Pokemon: ${avgPuzzlesPerPokemon}`);
  console.log(`   Min/Max per Pokemon: ${minPuzzles}/${maxPuzzles}`);
  console.log(`   Distribution:`);
  for (const [count, numPokemon] of Array.from(countDistribution.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`     • ${numPokemon} Pokemon with ${count} puzzle${count > 1 ? 's' : ''}`);
  }
  console.log();
  
  // STEP 8: Write to CSV
  console.log("💾 STEP 8: Writing to CSV...");
  const csvPath = path.join(process.cwd(), 'data', `puzzles-gen${gen}.csv`);
  const csvHeader = "pokemonId,pokemonName,ndexId,moveIds,generation\n";
  const csvRows = selectedPuzzles.map(p => 
    `${p.pokemonId},${p.pokemonName},${p.ndexId},"${p.moveIds}",${p.generation}`
  ).join('\n');
  
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, csvHeader + csvRows);
  
  const fileSize = (fs.statSync(csvPath).size / 1024).toFixed(2);
  console.log(`   ✓ Saved to ${csvPath} (${fileSize} KB)\n`);
  
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`${'='.repeat(70)}`);
  console.log(`✅ GENERATION COMPLETE!`);
  console.log(`   Time: ${totalTime} minutes`);
  console.log(`   Combinations checked: ${totalCombinationsChecked.toLocaleString()}`);
  console.log(`   Unique candidates: ${allCandidates.length.toLocaleString()}`);
  console.log(`   Final puzzles: ${selectedPuzzles.length.toLocaleString()}`);
  console.log(`${'='.repeat(70)}\n`);
  
  process.exit(0);
}

generatePuzzles().catch(error => {
  console.error("\n❌ FATAL ERROR:", error);
  process.exit(1);
});
