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
  console.log(`   Target: ALL unique puzzles (excluding Mew)`);
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
           !name.includes('-totem') &&
           name !== 'mew' &&
           name !== 'mew-default';
  });
  
  console.log(`   ✓ Found ${filteredPokemon.length} Pokemon (Mew excluded)\n`);
  
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
    
    if (!pokemonPreviousCombos.has(pkmn.id)) {
      pokemonPreviousCombos.set(pkmn.id, new Set());
    }
    const previousCombos = pokemonPreviousCombos.get(pkmn.id)!;
    
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
    }
    
    if (pokemonUnique > 0) {
      console.log(`   ✓ ${pkmn.name}: ${pokemonUnique} puzzles`);
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
  console.log(`\n✅ Complete puzzles: ${totalPuzzles.toLocaleString()} (${totalTime}m)\n`);
  
  return totalPuzzles;
}

async function generateMewPuzzles(gen: number) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🌟 MEW PUZZLE GENERATION - Generation ${gen}`);
  console.log(`${'='.repeat(70)}\n`);
  
  const startTime = Date.now();
  
  console.log("🔍 Finding Mew...");
  const mewList = await db.select({
    id: pokemon.id,
    name: pokemon.name,
    ndexId: pokemon.ndexId,
    speciesName: pokemon.speciesName
  })
  .from(pokemon)
  .where(lte(pokemon.generationId, gen));
  
  const mewCandidates = mewList.filter(p => {
    const name = p.speciesName.toLowerCase();
    return name === 'mew' || name === 'mew-default';
  });
  
  if (mewCandidates.length === 0) {
    console.error("❌ Mew not found!");
    return 0;
  }
  
  const mew = mewCandidates[0];
  console.log(`   ✓ Found Mew (ID: ${mew.id})\n`);
  
  console.log("📦 Loading Mew's moves...");
  const moveIds = await getMovesForPokemon(mew.id, gen);
  console.log(`   ✓ Mew can learn ${moveIds.length} moves\n`);
  
  if (moveIds.length < 4) {
    console.error("❌ Mew has less than 4 moves!");
    return 0;
  }
  
  console.log("📦 Loading all Pokemon moves...");
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
  
  console.log(`🎯 Generating Mew puzzles...`);
  
  const csvPath = path.join(process.cwd(), 'data', `puzzles-mew-gen${gen}.csv`);
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  const csvHeader = "pokemonId,pokemonName,ndexId,moveIds,generation\n";
  fs.writeFileSync(csvPath, csvHeader);
  
  const previousCombos = new Set<string>();
  let totalPuzzles = 0;
  let buffer: string[] = [];
  const BUFFER_SIZE = 1000;
  
  for (const combo of generateCombinations(moveIds)) {
    if (!isUniqueMoveset(combo, mew.id, allPokemonMoves)) continue;
    if (!hasMinimumVariation(combo, previousCombos)) continue;
    
    const comboKey = combo.join(',');
    buffer.push(`${mew.id},${mew.name},${mew.ndexId},"${comboKey}",${gen}`);
    previousCombos.add(comboKey);
    totalPuzzles++;
    
    if (buffer.length >= BUFFER_SIZE) {
      fs.appendFileSync(csvPath, buffer.join('\n') + '\n');
      buffer = [];
    }
    
    if (totalPuzzles % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`   Progress: ${totalPuzzles.toLocaleString()} puzzles (${elapsed}m)`);
    }
  }
  
  if (buffer.length > 0) {
    fs.appendFileSync(csvPath, buffer.join('\n') + '\n');
  }
  
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Mew puzzles: ${totalPuzzles.toLocaleString()} (${totalTime}m)\n`);
  
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
  console.log(`🎮 COMPLETE + MEW PUZZLE GENERATION`);
  console.log(`   Generation: ${targetGen}`);
  console.log(`   This will generate BOTH complete and Mew puzzles`);
  console.log(`${'='.repeat(70)}\n`);
  
  const overallStart = Date.now();
  
  // Generate complete puzzles (excluding Mew)
  const completePuzzles = await generateCompletePuzzles(targetGen);
  
  // Generate Mew puzzles
  const mewPuzzles = await generateMewPuzzles(targetGen);
  
  const totalTime = ((Date.now() - overallStart) / 1000 / 60).toFixed(1);
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🎉 ALL GENERATION COMPLETE!`);
  console.log(`   Total time: ${totalTime} minutes`);
  console.log(`   Complete puzzles: ${completePuzzles.toLocaleString()}`);
  console.log(`   Mew puzzles: ${mewPuzzles.toLocaleString()}`);
  console.log(`   Grand total: ${(completePuzzles + mewPuzzles).toLocaleString()}`);
  console.log(`${'='.repeat(70)}\n`);
  
  process.exit(0);
}

main().catch(error => {
  console.error("\n❌ FATAL ERROR:", error);
  process.exit(1);
});
