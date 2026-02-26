import { db } from "../server/db";
import { pokemon, moves, pokemonMoves, versions } from "../shared/schema";
import { lte, and, inArray, eq, isNotNull } from "drizzle-orm";
import fs from "fs";
import path from "path";

// Get valid version IDs for a specific generation (not cumulative)
async function getValidVersionIds(targetGen: number): Promise<number[]> {
  const versionsList = await db.select({ id: versions.id })
    .from(versions)
    .where(and(
      eq(versions.generationId, targetGen),
      isNotNull(versions.generationId)
    ));
  return versionsList.map(v => v.id);
}

// Get Pokemon with their pre-evolutions
async function getPokemonWithPreEvolutions(pokemonId: number): Promise<number[]> {
  const result = [pokemonId];
  const visited = new Set<number>([pokemonId]);
  
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
async function getMovesForPokemon(pokemonId: number, targetGen: number): Promise<number[]> {
  const validVersionIds = await getValidVersionIds(targetGen);
  const pokemonWithPreEvos = await getPokemonWithPreEvolutions(pokemonId);
  
  const pokemonMovesList = await db.select({ moveId: pokemonMoves.moveId })
    .from(pokemonMoves)
    .where(and(
      inArray(pokemonMoves.pokemonId, pokemonWithPreEvos),
      inArray(pokemonMoves.versionGroupId, validVersionIds)
    ));
  
  const uniqueMoveIds = [...new Set(pokemonMovesList.map(m => m.moveId))];
  return uniqueMoveIds;
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

// Check variation (at least 3 different moves)
function hasMinimumVariation(moveIds: number[], previousCombos: Set<string>): boolean {
  const currentSet = new Set(moveIds);
  
  for (const prevCombo of previousCombos) {
    const prevMoves = prevCombo.split(',').map(Number);
    const prevSet = new Set(prevMoves);
    
    let sameCount = 0;
    for (const move of currentSet) {
      if (prevSet.has(move)) sameCount++;
    }
    
    if (sameCount >= 2) {
      return false;
    }
  }
  
  return true;
}

async function generateCompletePuzzles(gen: number) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 COMPLETE PUZZLE GENERATION - Generation ${gen}`);
  console.log(`   Target: ALL unique puzzles (INCLUDING Mew)`);
  console.log(`${'='.repeat(70)}\n`);
  
  const startTime = Date.now();
  
  console.log("📦 Loading Pokemon...");
  const allPokemon = await db.select({
    id: pokemon.id,
    name: pokemon.name,
    ndexId: pokemon.ndexId,
    speciesName: pokemon.speciesName
  })
  .from(pokemon)
  .where(lte(pokemon.generationId, gen));
  
  const filteredPokemon = allPokemon.filter(p => {
    const name = p.speciesName.toLowerCase();
    
    // Exclude cosmetic forms
    if (name.includes('-cap') ||
        name.includes('-original') ||
        name.includes('-hoenn') ||
        name.includes('-sinnoh') ||
        name.includes('-unova') ||
        name.includes('-kalos') ||
        name.includes('-alola') ||
        name.includes('-partner') ||
        name.includes('-world') ||
        name.includes('-gigantamax') ||
        name.includes('-totem')) {
      return false;
    }
    
    // For Pokemon with type-based forms (same learnset), keep only -default
    // Arceus has forms: arceus-normal, arceus-fighting, etc. (all same moves)
    // Silvally has forms: silvally-normal, silvally-fighting, etc. (all same moves)
    if ((name.startsWith('arceus-') || name.startsWith('silvally-')) && !name.endsWith('-default')) {
      return false;
    }
    
    // For Vivillon (pattern forms, same learnset), keep only -default or base
    if (name.startsWith('vivillon-') && !name.endsWith('-default') && name !== 'vivillon') {
      return false;
    }
    
    // For Minior (color forms, same learnset), keep only -default or base
    if (name.startsWith('minior-') && !name.endsWith('-default') && name !== 'minior') {
      return false;
    }
    
    // For Flabébé (flower color forms, same learnset), keep only -default or base
    if (name.startsWith('flabebe-') && !name.endsWith('-default') && name !== 'flabebe') {
      return false;
    }
    
    // For Floette (flower color forms, same learnset), keep only -default or base
    if (name.startsWith('floette-') && !name.endsWith('-default') && name !== 'floette') {
      return false;
    }
    
    // For Florges (flower color forms, same learnset), keep only -default or base
    if (name.startsWith('florges-') && !name.endsWith('-default') && name !== 'florges') {
      return false;
    }
    
    return true;
  });
  
  console.log(`   ✓ Found ${filteredPokemon.length} Pokemon (INCLUDING Mew)\n`);
  
  console.log("📦 Loading moves for all Pokemon...");
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
  
  console.log("🎯 Generating puzzles and streaming to CSV...");
  
  const csvPath = path.join(process.cwd(), 'data', `puzzles-gen${gen}-complete.csv`);
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  const csvHeader = "pokemonId,pokemonName,ndexId,moveIds,generation\n";
  fs.writeFileSync(csvPath, csvHeader);
  
  const pokemonPreviousCombos = new Map<number, Set<string>>();
  let totalPuzzles = 0;
  let buffer: string[] = [];
  const BUFFER_SIZE = 1000;
  
  for (let i = 0; i < filteredPokemon.length; i++) {
    const pkmn = filteredPokemon[i];
    const moveIds = Array.from(allPokemonMoves.get(pkmn.id) || []);
    
    if (moveIds.length < 4) continue;
    
    let pokemonUnique = 0;
    const pokemonStartTime = Date.now();
    
    if (!pokemonPreviousCombos.has(pkmn.id)) {
      pokemonPreviousCombos.set(pkmn.id, new Set());
    }
    const previousCombos = pokemonPreviousCombos.get(pkmn.id)!;
    
    // Check if this is Mew (has many moves)
    const isMew = pkmn.speciesName.toLowerCase().includes('mew');
    
    for (const combo of generateCombinations(moveIds)) {
      if (!isUniqueMoveset(combo, pkmn.id, allPokemonMoves)) continue;
      if (!hasMinimumVariation(combo, previousCombos)) continue;
      
      const comboKey = combo.join(',');
      buffer.push(`${pkmn.id},${pkmn.name},${pkmn.ndexId},"${comboKey}",${gen}`);
      previousCombos.add(comboKey);
      totalPuzzles++;
      pokemonUnique++;
      
      if (buffer.length >= BUFFER_SIZE) {
        fs.appendFileSync(csvPath, buffer.join('\n') + '\n');
        buffer = [];
      }
      
      // Progress for Mew (has many combinations)
      if (isMew && pokemonUnique % 100 === 0) {
        const elapsed = ((Date.now() - pokemonStartTime) / 1000 / 60).toFixed(1);
        console.log(`   🌟 Mew progress: ${pokemonUnique} puzzles (${elapsed}m)`);
      }
    }
    
    const pokemonTime = ((Date.now() - pokemonStartTime) / 1000).toFixed(1);
    if (pokemonUnique > 0) {
      const icon = isMew ? '🌟' : '✓';
      console.log(`   ${icon} ${pkmn.name}: ${pokemonUnique} puzzles (${pokemonTime}s)`);
    }
    
    if ((i + 1) % 10 === 0) {
      const progress = ((i + 1) / filteredPokemon.length * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`   📊 Progress: ${i + 1}/${filteredPokemon.length} (${progress}%) - ${elapsed}m`);
    }
  }
  
  if (buffer.length > 0) {
    fs.appendFileSync(csvPath, buffer.join('\n') + '\n');
  }
  
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const fileSize = (fs.statSync(csvPath).size / 1024 / 1024).toFixed(2);
  
  console.log(`\n✅ Complete puzzles (including Mew): ${totalPuzzles.toLocaleString()} (${totalTime}m)`);
  console.log(`   File: ${csvPath} (${fileSize} MB)\n`);
  
  return totalPuzzles;
}

async function main() {
  const args = process.argv.slice(2);
  const targetGen = args[0] ? parseInt(args[0]) : null;
  
  if (!targetGen || targetGen < 1 || targetGen > 9) {
    console.error("❌ Invalid generation. Usage: tsx generate-complete-and-mew.ts <generation>");
    console.error("   Example: tsx generate-complete-and-mew.ts 3");
    process.exit(1);
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🎮 COMPLETE PUZZLE GENERATION (INCLUDING MEW)`);
  console.log(`   Generation: ${targetGen}`);
  console.log(`   This will generate ALL puzzles in a single file`);
  console.log(`${'='.repeat(70)}\n`);
  
  const overallStart = Date.now();
  
  // Generate complete puzzles (including Mew)
  const totalPuzzles = await generateCompletePuzzles(targetGen);
  
  const totalTime = ((Date.now() - overallStart) / 1000 / 60).toFixed(1);
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🎉 GENERATION COMPLETE!`);
  console.log(`   Total time: ${totalTime} minutes`);
  console.log(`   Total puzzles: ${totalPuzzles.toLocaleString()}`);
  console.log(`${'='.repeat(70)}\n`);
  
  process.exit(0);
}

main().catch(error => {
  console.error("\n❌ FATAL ERROR:", error);
  process.exit(1);
});
