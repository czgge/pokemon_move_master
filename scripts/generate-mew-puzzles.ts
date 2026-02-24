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
  
  const pokemonMovesList = await db.select({ moveId: pokemonMoves.moveId })
    .from(pokemonMoves)
    .where(and(
      inArray(pokemonMoves.pokemonId, pokemonWithPreEvos),
      inArray(pokemonMoves.versionGroupId, validVersionIds)
    ));
  
  // Remove duplicates manually
  const uniqueMoveIds = [...new Set(pokemonMovesList.map(m => m.moveId))];
  return uniqueMoveIds;
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

async function generateMewPuzzles() {
  const args = process.argv.slice(2);
  const genArg = args[0] || process.env.GENERATION;
  const targetGen = genArg ? parseInt(genArg) : null;
  
  if (!targetGen || targetGen < 1 || targetGen > 9) {
    console.error("❌ Invalid generation. Usage: tsx generate-mew-puzzles.ts <generation>");
    console.error("   Example: tsx generate-mew-puzzles.ts 3");
    process.exit(1);
  }
  
  const gen = targetGen;
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🌟 MEW COMPLETE PUZZLE GENERATION - Generation ${gen}`);
  console.log(`   Target: ALL unique puzzles for Mew`);
  console.log(`   Strategy: Complete generation with variation check`);
  console.log(`${'='.repeat(70)}\n`);
  
  const startTime = Date.now();
  
  // Find Mew
  console.log("🔍 Finding Mew...");
  const mewList = await db.select({
    id: pokemon.id,
    name: pokemon.name,
    ndexId: pokemon.ndexId,
    speciesName: pokemon.speciesName
  })
  .from(pokemon)
  .where(lte(pokemon.generationId, gen));
  
  // Filter for Mew (could be 'mew' or 'mew-default')
  const mewCandidates = mewList.filter(p => {
    const name = p.speciesName.toLowerCase();
    return name === 'mew' || name === 'mew-default';
  });
  
  if (mewCandidates.length === 0) {
    console.error("❌ Mew not found in database!");
    console.error("   Searched for: 'mew' or 'mew-default'");
    process.exit(1);
  }
  
  const mew = mewCandidates[0];
  console.log(`   ✓ Found Mew (ID: ${mew.id}, Ndex: ${mew.ndexId}, Species: ${mew.speciesName})\n`);
  
  // Load Mew's moves
  console.log("📦 Loading Mew's moves...");
  const moveIds = await getMovesForPokemon(mew.id, gen);
  console.log(`   ✓ Mew can learn ${moveIds.length} moves\n`);
  
  if (moveIds.length < 4) {
    console.error("❌ Mew has less than 4 moves!");
    process.exit(1);
  }
  
  // Calculate total combinations
  const totalCombinations = (moveIds.length * (moveIds.length - 1) * (moveIds.length - 2) * (moveIds.length - 3)) / 24;
  console.log(`📊 Total possible combinations: ${totalCombinations.toLocaleString()}`);
  console.log(`   Generating ALL unique puzzles with variation check.`);
  console.log(`   ⚠️ This may take 30-60 minutes due to the large number of moves.\n`);
  
  // Load all Pokemon moves for uniqueness check
  console.log("📦 Loading all Pokemon moves for uniqueness check...");
  const allPokemon = await db.select({
    id: pokemon.id,
    speciesName: pokemon.speciesName
  })
  .from(pokemon)
  .where(lte(pokemon.generationId, gen));
  
  const allPokemonMoves = new Map<number, Set<number>>();
  for (const pkmn of allPokemon) {
    const moves = await getMovesForPokemon(pkmn.id, gen);
    allPokemonMoves.set(pkmn.id, new Set(moves));
  }
  console.log(`   ✓ Loaded moves for ${allPokemon.length} Pokemon\n`);
  
  // Generate puzzles
  console.log(`🎯 Generating ALL puzzles for Mew and streaming to CSV...`);
  
  const csvPath = path.join(process.cwd(), 'data', `puzzles-mew-gen${gen}.csv`);
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  const csvHeader = "pokemonId,pokemonName,ndexId,moveIds,generation\n";
  fs.writeFileSync(csvPath, csvHeader);
  
  const previousCombos = new Set<string>();
  let totalPuzzles = 0;
  let totalChecked = 0;
  let buffer: string[] = [];
  const BUFFER_SIZE = 1000;
  
  // Generate ALL combinations
  for (const combo of generateCombinations(moveIds)) {
    totalChecked++;
    
    // Check uniqueness
    if (!isUniqueMoveset(combo, mew.id, allPokemonMoves)) {
      continue;
    }
    
    // Check variation
    if (!hasMinimumVariation(combo, previousCombos)) {
      continue;
    }
    
    // Add puzzle
    const comboKey = combo.join(',');
    buffer.push(`${mew.id},${mew.name},${mew.ndexId},"${comboKey}",${gen}`);
    previousCombos.add(comboKey);
    totalPuzzles++;
    
    // Write buffer
    if (buffer.length >= BUFFER_SIZE) {
      fs.appendFileSync(csvPath, buffer.join('\n') + '\n');
      buffer = [];
    }
    
    // Progress update every 100 puzzles
    if (totalPuzzles % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`   Progress: ${totalPuzzles.toLocaleString()} puzzles (${elapsed}m, checked ${totalChecked.toLocaleString()} combos)`);
    }
    
    // Heartbeat every 100k combinations
    if (totalChecked % 100000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`   💓 Heartbeat: Checked ${totalChecked.toLocaleString()} combinations (${elapsed}m)`);
    }
  }
  
  console.log(`\n   🎉 Finished processing all combinations!\n`);
  
  // Write remaining buffer
  if (buffer.length > 0) {
    fs.appendFileSync(csvPath, buffer.join('\n') + '\n');
  }
  
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const fileSize = (fs.statSync(csvPath).size / 1024 / 1024).toFixed(2);
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ MEW GENERATION COMPLETE!`);
  console.log(`   Time: ${totalTime} minutes`);
  console.log(`   Combinations checked: ${totalChecked.toLocaleString()}`);
  console.log(`   Puzzles generated: ${totalPuzzles.toLocaleString()}`);
  console.log(`   File: ${csvPath} (${fileSize} MB)`);
  console.log(`${'='.repeat(70)}\n`);
  
  process.exit(0);
}

generateMewPuzzles().catch(error => {
  console.error("\n❌ FATAL ERROR:", error);
  process.exit(1);
});
