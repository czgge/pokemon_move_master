// Simplified version - generates puzzles for Gen 1 only as a test
import { db } from "../server/db";
import { pokemon, moves, pokemonMoves, evolutions } from "../shared/schema";
import { eq, lte, sql, and, inArray } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function generateGen1Puzzles() {
  console.log("Generating Gen 1 puzzles...");
  
  // Get all Gen 1 Pokemon (excluding cosmetic forms)
  const allPokemon = await db.select({
    id: pokemon.id,
    name: pokemon.name,
    ndexId: pokemon.ndexId
  })
  .from(pokemon)
  .where(and(
    eq(pokemon.generationId, 1),
    sql`${pokemon.speciesName} NOT LIKE '%-cap'`,
    sql`${pokemon.speciesName} NOT LIKE '%-gigantamax'`,
    sql`${pokemon.speciesName} NOT LIKE '%-totem'`
  ));
  
  console.log(`Found ${allPokemon.length} Gen 1 Pokemon`);
  
  const puzzles: Array<{
    pokemonId: number;
    pokemonName: string;
    ndexId: number;
    moveIds: string;
    generation: number;
  }> = [];
  
  // For simplicity, just create some basic puzzles
  // In production, you'd want to check uniqueness properly
  for (const pkmn of allPokemon) {
    // Get moves for this Pokemon
    const pokemonMovesList = await db.select({ moveId: pokemonMoves.moveId })
      .from(pokemonMoves)
      .where(eq(pokemonMoves.pokemonId, pkmn.id))
      .limit(10);
    
    if (pokemonMovesList.length >= 4) {
      // Take first 4 moves as a simple puzzle
      const moveIds = pokemonMovesList.slice(0, 4).map(m => m.moveId);
      
      puzzles.push({
        pokemonId: pkmn.id,
        pokemonName: pkmn.name,
        ndexId: pkmn.ndexId,
        moveIds: moveIds.join(','),
        generation: 1
      });
    }
    
    if (puzzles.length % 10 === 0) {
      console.log(`Generated ${puzzles.length} puzzles...`);
    }
  }
  
  console.log(`Total puzzles: ${puzzles.length}`);
  
  // Write to CSV
  const csvPath = path.join(process.cwd(), 'data', 'puzzles-gen1.csv');
  const csvHeader = "pokemonId,pokemonName,ndexId,moveIds,generation\n";
  const csvRows = puzzles.map(p => 
    `${p.pokemonId},${p.pokemonName},${p.ndexId},"${p.moveIds}",${p.generation}`
  ).join('\n');
  
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, csvHeader + csvRows);
  
  console.log(`Saved to ${csvPath}`);
  console.log("Done!");
}

generateGen1Puzzles().catch(console.error).finally(() => process.exit(0));
