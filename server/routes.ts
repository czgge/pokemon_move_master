
import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "../shared/routes";
import { z } from "zod";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { db } from "./db";
import { pokemon, moves, pokemonMoves, versions, evolutions } from "../shared/schema";
import { eq, lte, sql, and, inArray } from "drizzle-orm";

function createRoundToken(data: any) {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

function decodeRoundToken(token: string) {
  try {
    return JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
  } catch (e) {
    return null;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // --- Game Routes ---

  app.post(api.game.start.path, async (req, res) => {
    try {
      const { maxGen, seenMovesets = [] } = api.game.start.input.parse(req.body);
      
      let attempts = 0;
      let roundData = null;
      let response = null;

      // Try to find a valid unique moveset up to 500 times
      while (attempts < 500) {
        attempts++;
        
        // 1. Get a random Pokemon
        const [targetPokemon] = await storage.getRandomPokemon(maxGen, 1);
        if (!targetPokemon) continue;

        // 2. Get valid moves
        const validMoves = await storage.getMovesForPokemon(targetPokemon.id, maxGen);
        if (validMoves.length < 4) continue;
        
        // 3. Select 4 random unique moves
        // Try different move combinations for the same pokemon
        for (let moveSetAttempt = 0; moveSetAttempt < 10; moveSetAttempt++) {
          const shuffledMoves = validMoves.sort(() => 0.5 - Math.random());
          const selectedMoves = shuffledMoves.slice(0, 4);
          const moveIds = selectedMoves.map(m => m.id);
          
          // Create a unique identifier for this moveset (sorted move names)
          const movesetKey = selectedMoves.map(m => m.name).sort().join('|');
          
          // Check if this exact combination was already seen in this game session
          if (seenMovesets.includes(movesetKey)) {
            console.log(`Skipping already seen moveset: ${movesetKey}`);
            continue;
          }

          // 4. Check Uniqueness (against other Pokemon)
          const isUnique = await storage.checkUniqueMoveset(moveIds, targetPokemon.id, maxGen);
          
          if (isUnique) {
            const roundId = Math.random().toString(36).substring(7);
            roundData = {
              roundId,
              correctPokemonId: targetPokemon.id,
              moves: selectedMoves.map(m => m.name),
              gen: maxGen
            };

            response = {
              roundId,
              moves: selectedMoves.map(m => ({
                name: m.name,
                type: m.type,
                power: m.power,
                pp: m.pp,
                accuracy: m.accuracy
              })),
              generation: maxGen,
              roundToken: createRoundToken(roundData)
            };
            break;
          }
        }
        if (response) break;
      }

      if (response) {
        res.json(response);
      } else {
        res.status(500).json({ message: "Failed to generate a unique moveset puzzle after multiple attempts. Please try again." });
      }

    } catch (error) {
       console.error("Error in /api/game/start:", error);
       res.status(500).json({ message: "Failed to start round", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(api.game.answer.path, async (req, res) => {
    try {
      const { roundToken, guessedPokemonId, attempt, hintsUsed } = api.game.answer.input.parse(req.body);
      const roundData = decodeRoundToken(roundToken);
      
      if (!roundData) {
        return res.status(400).json({ message: "Invalid token" });
      }

      // Check if the guess is exactly correct
      let isCorrect = roundData.correctPokemonId === guessedPokemonId;
      let missingMoves: string[] = [];
      
      console.log(`[Answer] Checking guess: ${guessedPokemonId} vs correct: ${roundData.correctPokemonId}`);
      console.log(`[Answer] Is exact match: ${isCorrect}`);
      
      // If not exact match, check if they're the same species (cosmetic forms)
      if (!isCorrect) {
        const sameSpecies = await storage.areSameSpeciesOrCosmeticForm(roundData.correctPokemonId, guessedPokemonId);
        if (sameSpecies) {
          console.log(`Accepting ${guessedPokemonId} as correct answer for ${roundData.correctPokemonId} (same species/cosmetic form)`);
          isCorrect = true;
        }
      }
      
      // If still not correct, check evolution relationships
      // Logic: 
      // 1. If correct is Salamence with moves Bagon learns, you can answer Bagon (going backward) ✅
      // 2. If correct is Bagon with Fly, you CANNOT answer Salamence (going forward) ❌
      // 3. If correct is Eevee with Eevee moves, you CAN answer Leafeon/Umbreon (going forward from base) ✅
      // 4. If correct is Leafeon, you CANNOT answer Umbreon (branching) ❌
      if (!isCorrect) {
        // Check TWO cases:
        // Case A: Guessed Pokemon is a PRE-EVOLUTION of correct Pokemon (going backward)
        const correctPokemonChain = await storage.getPokemonWithPreEvolutions(roundData.correctPokemonId);
        console.log(`[Answer] Correct Pokemon ${roundData.correctPokemonId} with pre-evolutions:`, correctPokemonChain);
        const isPreEvolution = correctPokemonChain.includes(guessedPokemonId);
        console.log(`[Answer] Is guessed Pokemon a pre-evolution of correct? ${isPreEvolution}`);
        
        // Case B: Correct Pokemon is a PRE-EVOLUTION of guessed Pokemon (going forward from base)
        const guessedPokemonChain = await storage.getPokemonWithPreEvolutions(guessedPokemonId);
        console.log(`[Answer] Guessed Pokemon ${guessedPokemonId} with pre-evolutions:`, guessedPokemonChain);
        const correctIsPreEvolution = guessedPokemonChain.includes(roundData.correctPokemonId);
        console.log(`[Answer] Is correct Pokemon a pre-evolution of guessed? ${correctIsPreEvolution}`);
        
        // Determine if we should check moves
        let shouldCheckMoves = false;
        
        if (isPreEvolution) {
          // Case A: Guessed is a pre-evolution of correct (going backward)
          // Example: Correct=Salamence, Guess=Bagon - ALWAYS allowed if moves match
          console.log(`[Answer] Case A: Guessed is pre-evolution of correct`);
          shouldCheckMoves = true;
        } else if (correctIsPreEvolution) {
          // Case B: Correct is a pre-evolution of guessed (going forward)
          // Example: Correct=Eevee, Guess=Leafeon
          // ONLY allowed if correct Pokemon is a BASE form AND can learn all the puzzle moves
          const correctHasPreEvos = correctPokemonChain.length > 1;
          console.log(`[Answer] Case B: Correct is pre-evolution of guessed`);
          console.log(`[Answer] Does correct have pre-evolutions? ${correctHasPreEvos}`);
          
          if (!correctHasPreEvos) {
            // Correct Pokemon is a base form - check if the CORRECT Pokemon can learn all moves
            console.log(`[Answer] Correct is a base form - checking if CORRECT Pokemon can learn all moves`);
            
            const puzzleMoveNames = roundData.moves;
            const puzzleMoves = await db.select({ id: moves.id, name: moves.name })
              .from(moves)
              .where(inArray(moves.name, puzzleMoveNames));
            const puzzleMoveIds = puzzleMoves.map(m => m.id);
            
            // Get valid versions for the generation
            const validVersions = await db.select({ id: versions.id })
              .from(versions)
              .where(lte(versions.generationId, roundData.gen));
            const validVersionIds = validVersions.map(v => v.id);
            
            // Get the CORRECT Pokemon + its pre-evolutions
            const correctPokemonWithPreEvos = await storage.getPokemonWithPreEvolutions(roundData.correctPokemonId);
            
            // Get moves the CORRECT Pokemon can learn
            const correctPokemonMoves = await db.selectDistinct({ moveId: pokemonMoves.moveId })
              .from(pokemonMoves)
              .where(and(
                inArray(pokemonMoves.pokemonId, correctPokemonWithPreEvos),
                inArray(pokemonMoves.versionGroupId, validVersionIds)
              ));
            
            const correctMoveIds = correctPokemonMoves.map(m => m.moveId);
            
            // Check if CORRECT Pokemon can learn all puzzle moves
            const correctCanLearnAll = puzzleMoveIds.every(moveId => correctMoveIds.includes(moveId));
            console.log(`[Answer] Can CORRECT Pokemon learn all moves? ${correctCanLearnAll}`);
            
            if (correctCanLearnAll) {
              // The puzzle is about the base form, so evolutions are accepted
              console.log(`[Answer] Puzzle is about base form - checking if guessed can also learn all moves`);
              shouldCheckMoves = true;
            } else {
              console.log(`[Answer] Puzzle is NOT about base form (has moves base can't learn) - rejecting`);
            }
          } else {
            console.log(`[Answer] Correct is NOT a base form - rejecting forward evolution`);
          }
        }
        
        // If we should check moves, validate that guessed Pokemon can learn all puzzle moves
        if (shouldCheckMoves) {
          console.log(`[Answer] Calculating missing moves for Pokemon ${guessedPokemonId} (including pre-evos)`);
          
          // Get Pokemon names for logging
          const [guessedPokemon] = await db.select({ name: pokemon.name })
            .from(pokemon)
            .where(eq(pokemon.id, guessedPokemonId));
          const [correctPokemon] = await db.select({ name: pokemon.name })
            .from(pokemon)
            .where(eq(pokemon.id, roundData.correctPokemonId));
          
          console.log(`[Answer] Guessed: ${guessedPokemon?.name} (ID: ${guessedPokemonId}), Correct: ${correctPokemon?.name} (ID: ${roundData.correctPokemonId})`);
          
          const puzzleMoveNames = roundData.moves;
          console.log(`[Answer] Puzzle moves:`, puzzleMoveNames);
          
          const puzzleMoves = await db.select({ id: moves.id, name: moves.name })
            .from(moves)
            .where(inArray(moves.name, puzzleMoveNames));
          
          console.log(`[Answer] Found puzzle moves in DB:`, puzzleMoves);
          const puzzleMoveIds = puzzleMoves.map(m => m.id);
          
          // Get valid versions for the generation
          const validVersions = await db.select({ id: versions.id })
            .from(versions)
            .where(lte(versions.generationId, roundData.gen));
          const validVersionIds = validVersions.map(v => v.id);
          
          console.log(`[Answer] Valid version IDs for gen ${roundData.gen}:`, validVersionIds.length);
          
          // Get the guessed Pokemon + its pre-evolutions (NOT future evolutions)
          const pokemonWithPreEvos = await storage.getPokemonWithPreEvolutions(guessedPokemonId);
          console.log(`[Answer] Guessed Pokemon with pre-evolutions IDs:`, pokemonWithPreEvos);
          
          // Get names of Pokemon in pre-evolution chain for debugging
          if (pokemonWithPreEvos.length > 0) {
            const chainPokemon = await db.select({ id: pokemon.id, name: pokemon.name })
              .from(pokemon)
              .where(inArray(pokemon.id, pokemonWithPreEvos));
            console.log(`[Answer] Pre-evolution chain Pokemon:`, chainPokemon);
          }
          
          // Get moves the guessed Pokemon AND its pre-evolutions can learn
          const guessedPokemonMoves = await db.selectDistinct({ moveId: pokemonMoves.moveId })
            .from(pokemonMoves)
            .where(and(
              inArray(pokemonMoves.pokemonId, pokemonWithPreEvos),
              inArray(pokemonMoves.versionGroupId, validVersionIds)
            ));
          
          const guessedMoveIds = guessedPokemonMoves.map(m => m.moveId);
          console.log(`[Answer] Guessed Pokemon (including pre-evos) can learn ${guessedMoveIds.length} total moves`);
          
          // Find which puzzle moves the guessed Pokemon CANNOT learn
          missingMoves = puzzleMoves
            .filter(move => !guessedMoveIds.includes(move.id))
            .map(move => move.name);
          
          console.log(`[Answer] Missing moves:`, missingMoves);
          
          // Check if the guessed Pokemon can learn ALL the puzzle moves
          const canLearnAll = missingMoves.length === 0;
          
          console.log(`[Answer] Can guessed Pokemon learn all moves? ${canLearnAll} (missing: ${missingMoves.join(', ')})`);
          
          if (canLearnAll) {
            console.log(`[Answer] Accepting evolution as correct answer!`);
            isCorrect = true;
            missingMoves = [];
          } else {
            console.log(`[Answer] Rejecting - cannot learn all moves`);
          }
        } else {
          console.log(`[Answer] Not in same evolution family - rejecting`);
          
          // Calculate missing moves for non-evolution case
          console.log(`[Answer] Calculating missing moves for non-evolution Pokemon ${guessedPokemonId}`);
          const puzzleMoveNames = roundData.moves;
          
          const puzzleMoves = await db.select({ id: moves.id, name: moves.name })
            .from(moves)
            .where(inArray(moves.name, puzzleMoveNames));
          
          const puzzleMoveIds = puzzleMoves.map(m => m.id);
          
          // Get valid versions for the generation
          const validVersions = await db.select({ id: versions.id })
            .from(versions)
            .where(lte(versions.generationId, roundData.gen));
          const validVersionIds = validVersions.map(v => v.id);
          
          // Get the guessed Pokemon + its pre-evolutions
          const pokemonWithPreEvos = await storage.getPokemonWithPreEvolutions(guessedPokemonId);
          
          // Get moves the guessed Pokemon AND its pre-evolutions can learn
          const guessedPokemonMoves = await db.selectDistinct({ moveId: pokemonMoves.moveId })
            .from(pokemonMoves)
            .where(and(
              inArray(pokemonMoves.pokemonId, pokemonWithPreEvos),
              inArray(pokemonMoves.versionGroupId, validVersionIds)
            ));
          
          const guessedMoveIds = guessedPokemonMoves.map(m => m.moveId);
          
          // Find which puzzle moves the guessed Pokemon CANNOT learn
          missingMoves = puzzleMoves
            .filter(move => !guessedMoveIds.includes(move.id))
            .map(move => move.name);
        }
      }

      let points = 0;

      if (isCorrect) {
        if (attempt === 1) points = 5;
        else if (attempt === 2) points = 4;
        else if (attempt === 3) points = 3;
        
        points -= hintsUsed; 
        if (points < 0) points = 0;
      }

      let correctPokemon = undefined;
      if (!isCorrect && attempt >= 3) {
         correctPokemon = await storage.getPokemon(roundData.correctPokemonId);
      }
      if (isCorrect) {
         // If the guessed Pokemon is different from the puzzle Pokemon (evolution case),
         // show the guessed Pokemon instead
         if (guessedPokemonId !== roundData.correctPokemonId) {
           correctPokemon = await storage.getPokemon(guessedPokemonId);
         } else {
           correctPokemon = await storage.getPokemon(roundData.correctPokemonId);
         }
      }

      console.log(`[Answer] Final response - isCorrect: ${isCorrect}, points: ${points}, missingMoves:`, missingMoves);

      res.json({
        correct: isCorrect,
        points,
        correctPokemon,
        livesRemaining: isCorrect ? 3 : (3 - attempt),
        missingMoves: missingMoves // Always send the array, even if empty
      });

    } catch (error) {
      console.error("Answer Error:", error);
      res.status(500).json({ message: "Error checking answer" });
    }
  });

  app.post(api.game.hint.path, async (req, res) => {
    try {
      const { roundToken, type } = api.game.hint.input.parse(req.body);
      const roundData = decodeRoundToken(roundToken);
      
      if (!roundData) return res.status(400).json({ message: "Invalid token" });

      const pokemon = await storage.getPokemon(roundData.correctPokemonId);
      if (!pokemon) return res.status(404).json({ message: "Pokemon not found" });

      let hint = "";
      if (type === 'generation') {
        hint = `This Pokémon was introduced in Gen ${pokemon.generationId}.`;
      } else if (type === 'type') {
         hint = `Type: ${pokemon.type1}${pokemon.type2 ? '/' + pokemon.type2 : ''}`;
      }

      res.json({ hint });
    } catch (error) {
      res.status(500).json({ message: "Error getting hint" });
    }
  });

  // Debug endpoint to check evolution data
  app.get("/api/debug/evolutions/:pokemonId", async (req, res) => {
    try {
      const pokemonId = parseInt(req.params.pokemonId);
      
      // Get Pokemon info
      const pkmn = await db.select().from(pokemon).where(eq(pokemon.id, pokemonId)).limit(1);
      
      // Get evolutions where this Pokemon evolves
      const evolvesInto = await db.select().from(evolutions).where(eq(evolutions.evolvedSpeciesId, pokemonId));
      
      // Get evolutions where this Pokemon is the result
      const evolvedFrom = await db.select().from(evolutions).where(eq(evolutions.evolvesIntoSpeciesId, pokemonId));
      
      res.json({
        pokemon: pkmn[0],
        evolvesInto,
        evolvedFrom
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get(api.pokedex.list.path, async (req, res) => {
    const maxGen = req.query.maxGen ? parseInt(req.query.maxGen as string) : undefined;
    const search = req.query.search as string;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const moveFilters = req.query.moves ? (req.query.moves as string).split(',') : [];
    const limit = 20;
    const offset = (page - 1) * limit;

    if (moveFilters.length > 0) {
      // Custom logic for filtering by moves
      try {
        // Get move IDs from move names - handle both "Hydro Cannon" and "hydro-cannon" formats
        const normalizedFilters = moveFilters.map(m => m.toLowerCase().replace(/-/g, ' ').trim());
        
        console.log("Original move filters:", moveFilters);
        console.log("Normalized filters:", normalizedFilters);
        
        // Query to find matching moves
        const moveIds = await db.select({ id: moves.id, name: moves.name })
          .from(moves)
          .where(
            sql`LOWER(REPLACE(${moves.name}, '-', ' ')) IN (${sql.join(normalizedFilters.map(m => sql`${m}`), sql`, `)})`
          );
        
        console.log("Found moves from database:", moveIds);
        
        const moveIdList = moveIds.map(m => m.id);
        
        if (moveIdList.length === 0) {
          console.log("No moves found matching filters - returning empty result");
          return res.json({ items: [], total: 0 });
        }
        
        if (moveIdList.length !== moveFilters.length) {
          console.warn(`Warning: Only found ${moveIdList.length} moves out of ${moveFilters.length} filters`);
        }

        // NEW APPROACH: 
        // 1. Find all Pokemon that directly learn these moves
        // 2. For each of those Pokemon, find their evolutions
        // 3. Include both the direct learners AND their evolutions in results
        
        const whereConditions = [
          inArray(pokemonMoves.moveId, moveIdList),
          maxGen ? lte(versions.generationId, maxGen) : undefined
        ].filter(Boolean);

        // Get all Pokemon that directly learn these moves
        const directLearners = await db.select({ 
          pokemonId: pokemonMoves.pokemonId
        })
        .from(pokemonMoves)
        .innerJoin(versions, eq(pokemonMoves.versionGroupId, versions.id))
        .where(and(...whereConditions))
        .groupBy(pokemonMoves.pokemonId)
        .having(sql`count(distinct ${pokemonMoves.moveId}) = ${moveIdList.length}`);

        const directLearnerIds = directLearners.map(p => p.pokemonId);
        console.log(`[Pokedex] Found ${directLearnerIds.length} Pokemon that directly learn all moves`);

        // Now find all evolutions of these Pokemon
        // Logic: If Pikachu (ID 25) learns Quick Attack, we need to find Raichu
        // We look in evolutions table where evolvedSpeciesId = 25, and get evolvesIntoSpeciesId
        const allPokemonIds = new Set<number>(directLearnerIds);
        
        console.log(`[Pokedex] Direct learner IDs: ${JSON.stringify(directLearnerIds)}`);
        
        for (const learnerId of directLearnerIds) {
          // Find Pokemon that evolve FROM this learner
          const evos = await db.select()
            .from(evolutions)
            .where(eq(evolutions.evolvedSpeciesId, learnerId));
          
          console.log(`[Pokedex] Checking evolutions for Pokemon ID ${learnerId}, found ${evos.length} evolutions`);
          
          for (const evo of evos) {
            allPokemonIds.add(evo.evolvesIntoSpeciesId);
            console.log(`[Pokedex] Added evolution: Pokemon ${evo.evolvedSpeciesId} -> Pokemon ${evo.evolvesIntoSpeciesId}`);
          }
        }

        console.log(`[Pokedex] Total Pokemon IDs (learners + evolutions): ${allPokemonIds.size}`);

        // Get full Pokemon data for all these IDs
        const finalWhereConditions = [
          inArray(pokemon.id, Array.from(allPokemonIds)),
          maxGen ? lte(pokemon.generationId, maxGen) : undefined,
          search ? sql`lower(${pokemon.name}) LIKE ${`%${search.toLowerCase()}%`}` : undefined
        ].filter(Boolean);
        
        const allResults = await db.select({
          id: pokemon.id,
          name: pokemon.name,
          speciesName: pokemon.speciesName,
          generationId: pokemon.generationId,
          type1: pokemon.type1,
          type2: pokemon.type2,
          imageUrl: pokemon.imageUrl,
          cryUrl: pokemon.cryUrl,
          hp: pokemon.hp,
          attack: pokemon.attack,
          defense: pokemon.defense,
          specialAttack: pokemon.specialAttack,
          specialDefense: pokemon.specialDefense,
          speed: pokemon.speed
        })
        .from(pokemon)
        .where(and(...finalWhereConditions));

        console.log(`[Pokedex] Final results: ${allResults.length} Pokemon`);

        // Apply pagination
        const total = allResults.length;
        const results = allResults.slice(offset, offset + limit);

        return res.json({ items: results, total });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error filtering by moves" });
      }
    }

    const result = await storage.getAllPokemon(maxGen, search, limit, offset);
    res.json(result);
  });

  app.get("/api/moves/search", async (req, res) => {
    try {
      const query = req.query.query as string;
      const gen = parseInt(req.query.gen as string) || 9;
      if (!query) return res.json([]);

      const results = await db.select({
        id: moves.id,
        name: moves.name,
        type: moves.type,
        power: moves.power,
        accuracy: moves.accuracy,
        pp: moves.pp,
        generationId: moves.generationId
      })
        .from(moves)
        .where(and(
          sql`lower(${moves.name}) LIKE ${`%${query.toLowerCase()}%`}`,
          lte(moves.generationId, gen)
        ))
        .limit(10);
      res.json(results);
    } catch (err) {
      console.error("Error in /api/moves/search:", err);
      res.status(500).json({ message: "Error searching moves", error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get(api.pokedex.search.path, async (req, res) => {
    const query = req.query.query as string;
    const maxGen = parseInt(req.query.maxGen as string);
    if (!query || isNaN(maxGen)) return res.json([]);
    
    const result = await storage.searchPokemon(query, maxGen);
    res.json(result);
  });

  // Game-specific search endpoint (excludes cosmetic form duplicates)
  app.get("/api/game/search-pokemon", async (req, res) => {
    try {
      const query = req.query.query as string;
      const maxGen = parseInt(req.query.maxGen as string);
      
      console.log(`Game search: query="${query}", maxGen=${maxGen}`);
      
      if (!query || isNaN(maxGen)) {
        console.log("Invalid query or maxGen, returning empty array");
        return res.json([]);
      }
      
      const result = await storage.searchPokemonForGame(query, maxGen);
      console.log(`Game search returned ${result.length} results`);
      res.json(result);
    } catch (error) {
      console.error("Error in /api/game/search-pokemon:", error);
      res.status(500).json({ message: "Error searching pokemon", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/pokemon/:id/moves", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const gen = parseInt(req.query.gen as string) || 9;
      console.log(`Fetching moves for Pokemon ID: ${id}, Gen: ${gen}`);
      
      // Debug: check pre-evolutions
      const preEvos = await storage.getPokemonWithPreEvolutions(id);
      console.log(`[DEBUG] Pokemon ${id} pre-evolution chain:`, preEvos);
      
      const moves = await storage.getMovesForPokemon(id, gen);
      console.log(`Found ${moves.length} moves`);
      res.json(moves);
    } catch (error) {
      console.error("Error in /api/pokemon/:id/moves:", error);
      res.status(500).json({ message: "Error fetching moves", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/game/validate-moveset", async (req, res) => {
    try {
      const { moves: moveNames, pokemonId, gen } = req.body;
      
      console.log("Validate moveset request:", { moveNames, pokemonId, gen });
      
      if (!moveNames || !Array.isArray(moveNames) || moveNames.length === 0) {
        return res.status(400).json({ message: "Invalid moves array" });
      }
      
      if (!pokemonId || !gen) {
        return res.status(400).json({ message: "Missing pokemonId or gen" });
      }
      
      // Get move IDs from names - normalize both sides for comparison
      const moveIds: number[] = [];
      for (const moveName of moveNames) {
        // Normalize the move name (remove spaces, lowercase)
        const normalized = moveName.toLowerCase().replace(/\s+/g, '-');
        console.log(`Looking for move: ${moveName} (normalized: ${normalized})`);
        
        const [move] = await db.select()
          .from(moves)
          .where(sql`lower(replace(${moves.name}, ' ', '-')) = ${normalized}`);
        
        if (move) {
          console.log(`Found move: ${move.name} (ID: ${move.id})`);
          moveIds.push(move.id);
        } else {
          console.log(`Move not found: ${moveName}`);
        }
      }
      
      if (moveIds.length !== moveNames.length) {
        console.log(`Only found ${moveIds.length} out of ${moveNames.length} moves`);
        return res.status(400).json({ message: `Some moves not found (found ${moveIds.length}/${moveNames.length})` });
      }
      
      console.log(`Checking uniqueness for moves:`, moveIds);
      
      // Get valid versions for this generation
      const validVersions = await db.select({ id: versions.id })
        .from(versions)
        .where(lte(versions.generationId, gen));
      const validVersionIds = validVersions.map(v => v.id);
      
      // Get the target Pokemon's species
      const [targetPokemon] = await db.select({ id: pokemon.id, speciesName: pokemon.speciesName, name: pokemon.name })
        .from(pokemon)
        .where(eq(pokemon.id, pokemonId));
      
      if (!targetPokemon) {
        return res.status(404).json({ message: "Pokemon not found" });
      }
      
      const targetSpeciesBase = targetPokemon.speciesName.split('-')[0];
      
      // Find all Pokemon (excluding same species forms) that can learn ALL these moves
      const otherPokemon = await db.select({ 
          pokemonId: pokemonMoves.pokemonId,
          pokemonName: pokemon.name,
          count: sql<number>`count(distinct ${pokemonMoves.moveId})`
        })
        .from(pokemonMoves)
        .innerJoin(pokemon, eq(pokemonMoves.pokemonId, pokemon.id))
        .where(and(
          inArray(pokemonMoves.moveId, moveIds),
          inArray(pokemonMoves.versionGroupId, validVersionIds),
          lte(pokemon.generationId, gen),
          sql`${pokemon.speciesName} NOT LIKE ${targetSpeciesBase + '%'}`
        ))
        .groupBy(pokemonMoves.pokemonId, pokemon.name)
        .having(sql`count(distinct ${pokemonMoves.moveId}) = ${moveIds.length}`);
      
      const isUnique = otherPokemon.length === 0;
      const sharedWith = otherPokemon.map(p => p.pokemonName);
      
      console.log(`Moveset is unique: ${isUnique}`, sharedWith.length > 0 ? `Shared with: ${sharedWith.join(', ')}` : '');
      
      res.json({ isUnique, sharedWith });
    } catch (error) {
      console.error("Error in /api/game/validate-moveset:", error);
      res.status(500).json({ message: "Error validating moveset", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // New endpoint: Check which Pokemon can learn a moveset (without specifying a Pokemon)
  app.post("/api/game/check-moveset-owners", async (req, res) => {
    try {
      const { moves: moveNames, gen } = req.body;
      
      console.log("Check moveset owners request:", { moveNames, gen });
      
      if (!moveNames || !Array.isArray(moveNames) || moveNames.length === 0) {
        return res.status(400).json({ message: "Invalid moves array" });
      }
      
      if (!gen) {
        return res.status(400).json({ message: "Missing gen" });
      }
      
      // Get move IDs from names
      const moveIds: number[] = [];
      for (const moveName of moveNames) {
        const normalized = moveName.toLowerCase().replace(/\s+/g, '-');
        
        const [move] = await db.select()
          .from(moves)
          .where(sql`lower(replace(${moves.name}, ' ', '-')) = ${normalized}`);
        
        if (move) {
          moveIds.push(move.id);
        }
      }
      
      if (moveIds.length !== moveNames.length) {
        return res.status(400).json({ 
          message: `Some moves not found (found ${moveIds.length}/${moveNames.length})`,
          pokemon: []
        });
      }
      
      // Get valid versions for this generation
      const validVersions = await db.select({ id: versions.id })
        .from(versions)
        .where(lte(versions.generationId, gen));
      const validVersionIds = validVersions.map(v => v.id);
      
      // Find ALL Pokemon that can learn ALL these moves
      const pokemonWithMoveset = await db.select({ 
          pokemonId: pokemonMoves.pokemonId,
          pokemonName: pokemon.name,
          count: sql<number>`count(distinct ${pokemonMoves.moveId})`
        })
        .from(pokemonMoves)
        .innerJoin(pokemon, eq(pokemonMoves.pokemonId, pokemon.id))
        .where(and(
          inArray(pokemonMoves.moveId, moveIds),
          inArray(pokemonMoves.versionGroupId, validVersionIds),
          lte(pokemon.generationId, gen)
        ))
        .groupBy(pokemonMoves.pokemonId, pokemon.name)
        .having(sql`count(distinct ${pokemonMoves.moveId}) = ${moveIds.length}`)
        .orderBy(pokemon.name);
      
      const pokemonList = pokemonWithMoveset.map(p => p.pokemonName);
      
      console.log(`Found ${pokemonList.length} Pokemon that can learn this moveset`);
      
      res.json({ pokemon: pokemonList });
    } catch (error) {
      console.error("Error in /api/game/check-moveset-owners:", error);
      res.status(500).json({ message: "Error checking moveset", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(api.leaderboard.list.path, async (req, res) => {
    const genFilter = req.query.gen ? parseInt(req.query.gen as string) : undefined;
    const scores = await storage.getHighScores(genFilter);
    res.json(scores);
  });

  app.post(api.leaderboard.submit.path, async (req, res) => {
    const entry = await storage.createHighScore(req.body);
    res.status(201).json(entry);
  });

  // TEMPORARY ADMIN ENDPOINT - Remove after use
  app.post("/api/admin/reset-database", async (req, res) => {
    try {
      console.log("Starting database reset...");
      
      // Drop all tables to start fresh
      await db.execute(sql`DROP TABLE IF EXISTS evolutions CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS pokemon_moves CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS high_scores CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS moves CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS pokemon CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS versions CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS generations CASCADE`);
      console.log("All tables dropped");
      
      // Create evolutions table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS evolutions (
          id SERIAL PRIMARY KEY,
          evolved_species_id INTEGER NOT NULL,
          evolves_into_species_id INTEGER NOT NULL,
          evolution_trigger_id INTEGER,
          min_level INTEGER
        )
      `);
      
      // Create generations table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS generations (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        )
      `);
      
      // Create versions table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS versions (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          identifier TEXT NOT NULL,
          generation_id INTEGER REFERENCES generations(id)
        )
      `);
      
      // Create pokemon table with ndex_id
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pokemon (
          id INTEGER PRIMARY KEY,
          ndex_id INTEGER,
          name TEXT NOT NULL,
          species_name TEXT NOT NULL,
          generation_id INTEGER,
          type_1 TEXT NOT NULL,
          type_2 TEXT,
          image_url TEXT,
          cry_url TEXT,
          hp INTEGER,
          attack INTEGER,
          defense INTEGER,
          special_attack INTEGER,
          special_defense INTEGER,
          speed INTEGER
        )
      `);
      
      // Create moves table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS moves (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          power INTEGER,
          accuracy INTEGER,
          pp INTEGER,
          generation_id INTEGER,
          description TEXT
        )
      `);
      
      // Create pokemon_moves table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pokemon_moves (
          id SERIAL PRIMARY KEY,
          pokemon_id INTEGER REFERENCES pokemon(id),
          move_id INTEGER REFERENCES moves(id),
          version_group_id INTEGER,
          level INTEGER DEFAULT 0,
          method TEXT
        )
      `);
      
      // Create high_scores table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS high_scores (
          id SERIAL PRIMARY KEY,
          player_name TEXT NOT NULL,
          score INTEGER NOT NULL,
          gen_filter INTEGER,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      console.log("All tables created");
      
      // Force re-seed the database
      console.log("Starting forced database seed...");
      await seedDatabase(true);
      console.log("Database seed completed!");
      
      res.json({ 
        success: true, 
        message: "Database reset e re-seed completati! Tutti i dati sono stati ricaricati con le ultime modifiche." 
      });
    } catch (error) {
      console.error("Reset error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Errore nel reset del database", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // DEBUG ENDPOINT - Check evolutions
  app.get("/api/admin/check-evolutions", async (req, res) => {
    try {
      const evolutionCount = await db.select({ count: sql`count(*)` }).from(evolutions);
      const sampleEvolutions = await db.select().from(evolutions).limit(10);
      
      // Check Exeggcute/Exeggutor specifically
      const exeggcute = await db.select().from(pokemon).where(sql`lower(${pokemon.name}) LIKE '%exeggcute%'`);
      const exeggutor = await db.select().from(pokemon).where(sql`lower(${pokemon.name}) LIKE '%exeggutor%'`);
      
      let exeggcuteEvolutions = [];
      let exeggutorEvolutions = [];
      
      if (exeggcute.length > 0) {
        exeggcuteEvolutions = await db.select()
          .from(evolutions)
          .where(sql`${evolutions.evolvedSpeciesId} = ${exeggcute[0].id} OR ${evolutions.evolvesIntoSpeciesId} = ${exeggcute[0].id}`);
      }
      
      if (exeggutor.length > 0) {
        exeggutorEvolutions = await db.select()
          .from(evolutions)
          .where(sql`${evolutions.evolvedSpeciesId} = ${exeggutor[0].id} OR ${evolutions.evolvesIntoSpeciesId} = ${exeggutor[0].id}`);
      }
      
      res.json({
        totalEvolutions: evolutionCount[0].count,
        sampleEvolutions,
        exeggcute: exeggcute[0] || null,
        exeggutor: exeggutor[0] || null,
        exeggcuteEvolutions,
        exeggutorEvolutions
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ADMIN ENDPOINT - Add database indexes for performance
  app.post("/api/admin/add-indexes", async (req, res) => {
    try {
      console.log("Adding database indexes for performance optimization...");
      
      // Check and create indexes for pokemon_moves table
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS pokemon_moves_pokemon_id_idx 
        ON pokemon_moves(pokemon_id)
      `);
      console.log("✓ Created index: pokemon_moves_pokemon_id_idx");
      
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS pokemon_moves_move_id_idx 
        ON pokemon_moves(move_id)
      `);
      console.log("✓ Created index: pokemon_moves_move_id_idx");
      
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS pokemon_moves_version_group_id_idx 
        ON pokemon_moves(version_group_id)
      `);
      console.log("✓ Created index: pokemon_moves_version_group_id_idx");
      
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS pokemon_moves_pokemon_version_idx 
        ON pokemon_moves(pokemon_id, version_group_id)
      `);
      console.log("✓ Created index: pokemon_moves_pokemon_version_idx");
      
      // Check and create indexes for pokemon table
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS pokemon_species_name_idx 
        ON pokemon(species_name)
      `);
      console.log("✓ Created index: pokemon_species_name_idx");
      
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS pokemon_generation_id_idx 
        ON pokemon(generation_id)
      `);
      console.log("✓ Created index: pokemon_generation_id_idx");
      
      console.log("✅ All indexes created successfully!");
      
      res.json({ 
        success: true, 
        message: "Indici del database creati con successo! Le performance dovrebbero essere migliorate." 
      });
    } catch (error) {
      console.error("Error creating indexes:", error);
      res.status(500).json({ 
        success: false, 
        message: "Errore nella creazione degli indici", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Seeding is now done manually via /admin endpoint to avoid startup issues
  // seedDatabase().catch(console.error);

  return httpServer;
}

// --- Seeding Logic ---

async function seedDatabase(force: boolean = false) {
  const isSeeded = await storage.isSeeded();
  
  // Always fix Partner forms, even if already seeded
  console.log("Checking and fixing special form generations...");
  try {
    // Partner forms (Gen 7)
    const partnerForms = await db.select()
      .from(pokemon)
      .where(sql`${pokemon.name} LIKE '%Partner%'`);
    console.log(`Found ${partnerForms.length} Partner forms:`, partnerForms.map(p => `${p.name} (Gen ${p.generationId})`));
    await db.update(pokemon)
      .set({ generationId: 7 })
      .where(sql`${pokemon.name} LIKE '%Partner%'`);
    
    // Primal forms (Gen 6)
    const primalForms = await db.select()
      .from(pokemon)
      .where(sql`${pokemon.name} LIKE '%Primal%'`);
    console.log(`Found ${primalForms.length} Primal forms:`, primalForms.map(p => `${p.name} (Gen ${p.generationId})`));
    await db.update(pokemon)
      .set({ generationId: 6 })
      .where(sql`${pokemon.name} LIKE '%Primal%'`);
    
    // Gigantamax forms (Gen 8)
    await db.update(pokemon)
      .set({ generationId: 8 })
      .where(sql`${pokemon.name} LIKE '%Gigantamax%'`);
    
    // Eternamax (Gen 8)
    await db.update(pokemon)
      .set({ generationId: 8 })
      .where(sql`${pokemon.name} LIKE '%Eternamax%'`);
    
    // Ultra forms (Gen 7)
    await db.update(pokemon)
      .set({ generationId: 7 })
      .where(sql`${pokemon.name} LIKE '%Ultra%'`);
    
    // Crowned forms (Gen 8)
    await db.update(pokemon)
      .set({ generationId: 8 })
      .where(sql`${pokemon.name} LIKE '%Crowned%'`);
    
    // Dialga/Palkia Origin (Gen 8, Legends Arceus)
    await db.update(pokemon)
      .set({ generationId: 8 })
      .where(sql`(${pokemon.name} LIKE 'dialga%Origin%' OR ${pokemon.name} LIKE 'palkia%Origin%')`);
    
    // Pikachu special forms
    // Pikachu with caps (Gen 7)
    await db.update(pokemon)
      .set({ generationId: 7 })
      .where(sql`${pokemon.name} LIKE 'pikachu%Cap%'`);
    
    // Pikachu cosplay forms (Gen 6)
    await db.update(pokemon)
      .set({ generationId: 6 })
      .where(sql`(${pokemon.name} LIKE 'pikachu%Rock Star%' OR ${pokemon.name} LIKE 'pikachu%Belle%' OR ${pokemon.name} LIKE 'pikachu%Pop Star%' OR ${pokemon.name} LIKE 'pikachu%PhD%' OR ${pokemon.name} LIKE 'pikachu%Libre%')`);
    
    // Eevee Partner (Gen 7)
    await db.update(pokemon)
      .set({ generationId: 7 })
      .where(sql`${pokemon.name} LIKE 'eevee%Partner%'`);
    // Rename cosmetic forms to base names (this creates duplicates which is OK - they'll have different IDs)
    console.log("Renaming cosmetic forms to base names...");
    const formSuffixes = [
      ' (Spring Form)', ' (Summer Form)', ' (Autumn Form)', ' (Winter Form)',
      ' (Sunny Form)', ' (Rainy Form)', ' (Snowy Form)',
      ' (Sunshine)',
      ' (Plant Cloak)', ' (Sandy Cloak)', ' (Trash Cloak)',
      ' (West Sea)', ' (East Sea)',
      ' (Red-Striped Form)', ' (Blue-Striped Form)',
      ' (Meadow Pattern)', ' (Fancy Pattern)', ' (Poké Ball Pattern)',
      ' (Red Flower)', ' (Orange Flower)', ' (Yellow Flower)', ' (Blue Flower)', ' (White Flower)',
      ' (Natural Form)', ' (Dandy Trim)', ' (Heart Trim)',
      ' (Meteor Form)', ' (Red Core)', ' (Orange Core)',
      ' (Vanilla Cream)', ' (Ruby Cream)'
    ];
    
    for (const suffix of formSuffixes) {
      await db.update(pokemon)
        .set({ name: sql`REPLACE(${pokemon.name}, ${suffix}, '')` })
        .where(sql`${pokemon.name} LIKE ${'%' + suffix}`);
    }
    
    console.log("Fixed special form generations");
  } catch (err) {
    console.log("Error fixing special forms:", err);
  }
  
  if (isSeeded && !force) {
    console.log("Database already seeded.");
    return;
  }
  
  console.log("Starting database seed...");

  const generationsData = await parseCsv('attached_assets/generations_1771232352572.csv');
  await storage.seedGenerations(generationsData.map((r: any) => ({
    id: parseInt(r.id),
    name: r.name
  })));
  console.log("Seeded generations");

  const versionsData = await parseCsv('attached_assets/versions_1771232352575.csv');
  await storage.seedVersions(versionsData.map((r: any) => ({
    id: parseInt(r.id),
    name: r.name,
    identifier: r.identifier,
    generationId: parseInt(r.generation_id)
  })));
  console.log("Seeded versions");

  const TYPE_MAP: Record<string, string> = {
    "1": "Normal", "2": "Fighting", "3": "Flying", "4": "Poison", "5": "Ground", 
    "6": "Rock", "7": "Bug", "8": "Ghost", "9": "Steel", "10": "Fire", 
    "11": "Water", "12": "Grass", "13": "Electric", "14": "Psychic", "15": "Ice", 
    "16": "Dragon", "17": "Dark", "18": "Fairy"
  };

  const pokemonData = await parseCsv('attached_assets/pokemon_forms_1771232352573.csv');
  
  function getGenFromDex(id: number): number {
    if (id <= 151) return 1;
    if (id <= 251) return 2;
    if (id <= 386) return 3;
    if (id <= 493) return 4;
    if (id <= 649) return 5;
    if (id <= 721) return 6;
    if (id <= 809) return 7;
    if (id <= 905) return 8;
    return 9;
  }

  const mappedPokemon = pokemonData.map((r: any) => {
    let gen = getGenFromDex(parseInt(r.ndex_id));
    const formName = r.form_name || "";
    const identifier = r.identifier || "";
    
    // Regional forms
    if (formName.includes("Alolan")) gen = 7;
    if (formName.includes("Galarian")) gen = 8;
    if (formName.includes("Hisuian")) gen = 8;
    if (formName.includes("Paldean")) gen = 9;
    
    // Battle forms and transformations
    if (formName.includes("Mega")) gen = gen < 6 ? 6 : gen; // Mega Evolution (Gen 6+)
    if (formName.includes("Primal")) gen = 6; // Primal Reversion (ORAS, Gen 6)
    if (formName.includes("Gigantamax")) gen = 8; // Gigantamax (Sword/Shield, Gen 8)
    if (formName.includes("Eternamax")) gen = 8; // Eternamax Eternatus (Sword/Shield, Gen 8)
    if (formName.includes("Ultra")) gen = 7; // Ultra Necrozma (Ultra Sun/Moon, Gen 7)
    if (formName.includes("Crowned")) gen = 8; // Crowned Zacian/Zamazenta (Sword/Shield, Gen 8)
    
    // Origin Formes from Legends Arceus (Gen 8)
    if (formName.includes("Origin") && (identifier === "dialga" || identifier === "palkia" || identifier === "giratina")) {
      // Giratina Origin is from Gen 4 (Platinum), but Dialga/Palkia Origin are from Gen 8 (Legends Arceus)
      if (identifier === "giratina") {
        gen = gen < 4 ? 4 : gen; // Giratina Origin from Platinum (Gen 4)
      } else {
        gen = 8; // Dialga/Palkia Origin from Legends Arceus (Gen 8)
      }
    }
    
    // Special Pikachu forms
    if (identifier === "pikachu") {
      // Pikachu with caps (Gen 7 - Pokémon GO and Let's Go)
      if (formName.includes("Cap") || formName.includes("Original Cap") || formName.includes("Hoenn Cap") || 
          formName.includes("Sinnoh Cap") || formName.includes("Unova Cap") || formName.includes("Kalos Cap") || 
          formName.includes("Alola Cap") || formName.includes("Partner Cap") || formName.includes("World Cap")) {
        gen = 7;
      }
      // Pikachu cosplay forms (Gen 6 - ORAS)
      if (formName.includes("Rock Star") || formName.includes("Belle") || formName.includes("Pop Star") || 
          formName.includes("PhD") || formName.includes("Libre")) {
        gen = 6;
      }
    }
    
    // Special Eevee forms
    if (identifier === "eevee") {
      // Eevee Partner (Gen 7 - Let's Go)
      if (formName.includes("Partner")) {
        gen = 7;
      }
    }
    
    // General Partner forms (Let's Go Pikachu/Eevee - Gen 7)
    if (formName.includes("Partner")) gen = 7;

    return {
      id: parseInt(r.id),
      ndexId: parseInt(r.ndex_id),
      name: r.form_name ? `${r.identifier} (${r.form_name})` : r.identifier.replace(/-default$/, ''),
      speciesName: r.identifier,
      generationId: gen,
      type1: TYPE_MAP[r.type_1_id] || "Unknown",
      type2: r.type_2_id ? (TYPE_MAP[r.type_2_id] || null) : null,
      imageUrl: r.main_image_normal_path,
      cryUrl: r.pokemon_cry_path,
      hp: r.stat_hp ? parseInt(r.stat_hp) : null,
      attack: r.stat_attack ? parseInt(r.stat_attack) : null,
      defense: r.stat_defense ? parseInt(r.stat_defense) : null,
      specialAttack: r.stat_spatk ? parseInt(r.stat_spatk) : null,
      specialDefense: r.stat_spdef ? parseInt(r.stat_spdef) : null,
      speed: r.stat_speed ? parseInt(r.stat_speed) : null,
    };
  });

  await storage.seedPokemon(mappedPokemon);
  console.log("Seeded pokemon");

  // Fix special forms that might have incorrect generations and names
  console.log("Fixing special form generations and names...");
  await db.update(pokemon).set({ generationId: 7 }).where(sql`${pokemon.name} LIKE '%Partner%'`);
  await db.update(pokemon).set({ generationId: 6 }).where(sql`${pokemon.name} LIKE '%Primal%'`);
  await db.update(pokemon).set({ generationId: 8 }).where(sql`${pokemon.name} LIKE '%Gigantamax%'`);
  await db.update(pokemon).set({ generationId: 8 }).where(sql`${pokemon.name} LIKE '%Eternamax%'`);
  await db.update(pokemon).set({ generationId: 7 }).where(sql`${pokemon.name} LIKE '%Ultra%'`);
  await db.update(pokemon).set({ generationId: 8 }).where(sql`${pokemon.name} LIKE '%Crowned%'`);
  await db.update(pokemon).set({ generationId: 8 }).where(sql`(${pokemon.name} LIKE 'dialga%Origin%' OR ${pokemon.name} LIKE 'palkia%Origin%')`);
  
  // Fix Pikachu special forms
  await db.update(pokemon).set({ generationId: 7 }).where(sql`${pokemon.name} LIKE 'pikachu%Cap%'`);
  await db.update(pokemon).set({ generationId: 6 }).where(sql`(${pokemon.name} LIKE 'pikachu%Rock Star%' OR ${pokemon.name} LIKE 'pikachu%Belle%' OR ${pokemon.name} LIKE 'pikachu%Pop Star%' OR ${pokemon.name} LIKE 'pikachu%PhD%' OR ${pokemon.name} LIKE 'pikachu%Libre%')`);
  
  // Fix Eevee Partner form
  await db.update(pokemon).set({ generationId: 7 }).where(sql`${pokemon.name} LIKE 'eevee%Partner%'`);
  // Rename cosmetic forms to base names (remove form suffixes)
  console.log("Renaming cosmetic forms to base names...");
  // Seasonal forms
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Spring Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Spring Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Summer Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Summer Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Autumn Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Autumn Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Winter Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Winter Form)'`);
  // Castform
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Default Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Default Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Sunny Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Sunny Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Rainy Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Rainy Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Snowy Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Snowy Form)'`);
  // Cherrim
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Overcast Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Overcast Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Sunshine)', '')` }).where(sql`${pokemon.name} LIKE '% (Sunshine)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Sunshine Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Sunshine Form)'`);
  // Burmy (NOT Wormadam - those have different movesets)
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Plant Cloak)', '')` }).where(sql`${pokemon.name} LIKE 'burmy%Plant Cloak%'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Sandy Cloak)', '')` }).where(sql`${pokemon.name} LIKE 'burmy%Sandy Cloak%'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Trash Cloak)', '')` }).where(sql`${pokemon.name} LIKE 'burmy%Trash Cloak%'`);  // Shellos/Gastrodon
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (West Sea)', '')` }).where(sql`${pokemon.name} LIKE '% (West Sea)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (East Sea)', '')` }).where(sql`${pokemon.name} LIKE '% (East Sea)'`);
  // Basculin
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Red-Striped Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Red-Striped Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Red-Stripe Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Red-Stripe Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Blue-Striped Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Blue-Striped Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Blue-Stripe Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Blue-Stripe Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (White-Striped Form)', '')` }).where(sql`${pokemon.name} LIKE '% (White-Striped Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (White-Stripe Form)', '')` }).where(sql`${pokemon.name} LIKE '% (White-Stripe Form)'`);
  // Vivillon patterns
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Meadow Pattern)', '')` }).where(sql`${pokemon.name} LIKE '% (Meadow Pattern)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Fancy Pattern)', '')` }).where(sql`${pokemon.name} LIKE '% (Fancy Pattern)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Poké Ball Pattern)', '')` }).where(sql`${pokemon.name} LIKE '% (Poké Ball Pattern)'`);
  // Flabébé/Floette/Florges colors
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Red Flower)', '')` }).where(sql`${pokemon.name} LIKE '% (Red Flower)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Orange Flower)', '')` }).where(sql`${pokemon.name} LIKE '% (Orange Flower)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Yellow Flower)', '')` }).where(sql`${pokemon.name} LIKE '% (Yellow Flower)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Blue Flower)', '')` }).where(sql`${pokemon.name} LIKE '% (Blue Flower)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (White Flower)', '')` }).where(sql`${pokemon.name} LIKE '% (White Flower)'`);
  // Furfrou trims (all 10 forms)
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Natural Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Natural Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Heart Trim)', '')` }).where(sql`${pokemon.name} LIKE '% (Heart Trim)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Star Trim)', '')` }).where(sql`${pokemon.name} LIKE '% (Star Trim)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Diamond Trim)', '')` }).where(sql`${pokemon.name} LIKE '% (Diamond Trim)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Debutante Trim)', '')` }).where(sql`${pokemon.name} LIKE '% (Debutante Trim)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Matron Trim)', '')` }).where(sql`${pokemon.name} LIKE '% (Matron Trim)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Dandy Trim)', '')` }).where(sql`${pokemon.name} LIKE '% (Dandy Trim)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (La Reine Trim)', '')` }).where(sql`${pokemon.name} LIKE '% (La Reine Trim)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Kabuki Trim)', '')` }).where(sql`${pokemon.name} LIKE '% (Kabuki Trim)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Pharaoh Trim)', '')` }).where(sql`${pokemon.name} LIKE '% (Pharaoh Trim)'`);
  // Minior
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Meteor Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Meteor Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Red Core)', '')` }).where(sql`${pokemon.name} LIKE '% (Red Core)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Orange Core)', '')` }).where(sql`${pokemon.name} LIKE '% (Orange Core)'`);
  // Alcremie
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Vanilla Cream)', '')` }).where(sql`${pokemon.name} LIKE '% (Vanilla Cream)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Ruby Cream)', '')` }).where(sql`${pokemon.name} LIKE '% (Ruby Cream)'`);
  // Pikachu cosmetic forms
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Default Form)', '')` }).where(sql`${pokemon.name} LIKE 'pikachu%Default Form%'`);
  // Rename pikachu-default to just pikachu (base form)
  await db.update(pokemon).set({ name: 'pikachu' }).where(eq(pokemon.name, 'pikachu-default'));
  
  // General cleanup: rename all -default forms to base name (EXCEPT Tapu which are different Pokemon)
  // This fixes duplicates like raichu/raichu-default, rattata/rattata-default, etc.
  // Use simple REPLACE instead of REGEXP_REPLACE for better compatibility
  await db.execute(sql`
    UPDATE pokemon 
    SET name = REPLACE(name, '-default', '')
    WHERE name LIKE '%-default'
    AND name NOT LIKE 'tapu-%'
  `);
  
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Original Cap)', '')` }).where(sql`${pokemon.name} LIKE '% (Original Cap)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Hoenn Cap)', '')` }).where(sql`${pokemon.name} LIKE '% (Hoenn Cap)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Sinnoh Cap)', '')` }).where(sql`${pokemon.name} LIKE '% (Sinnoh Cap)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Unova Cap)', '')` }).where(sql`${pokemon.name} LIKE '% (Unova Cap)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Kalos Cap)', '')` }).where(sql`${pokemon.name} LIKE '% (Kalos Cap)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Alola Cap)', '')` }).where(sql`${pokemon.name} LIKE '% (Alola Cap)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Partner Cap)', '')` }).where(sql`${pokemon.name} LIKE '% (Partner Cap)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (World Cap)', '')` }).where(sql`${pokemon.name} LIKE '% (World Cap)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Pop Star)', '')` }).where(sql`${pokemon.name} LIKE '% (Pop Star)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Rock Star)', '')` }).where(sql`${pokemon.name} LIKE '% (Rock Star)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Belle)', '')` }).where(sql`${pokemon.name} LIKE '% (Belle)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (PhD)', '')` }).where(sql`${pokemon.name} LIKE '% (PhD)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Libre)', '')` }).where(sql`${pokemon.name} LIKE '% (Libre)'`);
  // Eevee default form (NOT Partner or Gigantamax - those have different movesets)
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Default Form)', '')` }).where(sql`${pokemon.name} LIKE 'eevee%Default Form%'`);
  // Squawkabilly plumage colors
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Green Plumage)', '')` }).where(sql`${pokemon.name} LIKE '% (Green Plumage)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Blue Plumage)', '')` }).where(sql`${pokemon.name} LIKE '% (Blue Plumage)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Yellow Plumage)', '')` }).where(sql`${pokemon.name} LIKE '% (Yellow Plumage)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (White Plumage)', '')` }).where(sql`${pokemon.name} LIKE '% (White Plumage)'`);
  // Arceus type forms
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Default Form)', '')` }).where(sql`${pokemon.name} LIKE 'arceus%Default Form%'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Normal Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Normal Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Fighting Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Fighting Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Flying Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Flying Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Poison Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Poison Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Ground Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Ground Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Rock Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Rock Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Bug Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Bug Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Ghost Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Ghost Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Steel Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Steel Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Fire Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Fire Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Water Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Water Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Grass Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Grass Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Electric Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Electric Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Psychic Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Psychic Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Ice Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Ice Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Dragon Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Dragon Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Dark Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Dark Form)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Fairy Form)', '')` }).where(sql`${pokemon.name} LIKE '% (Fairy Form)'`);
  // Remove redundant form text from regional forms (keep the regional identifier but remove redundant parentheses)
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Alolan Form)', '')` }).where(sql`${pokemon.name} LIKE '%-alolan%Alolan Form%'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Galarian Form)', '')` }).where(sql`${pokemon.name} LIKE '%-galarian%Galarian Form%'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Hisuian Form)', '')` }).where(sql`${pokemon.name} LIKE '%-hisuian%Hisuian Form%'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Paldean Form)', '')` }).where(sql`${pokemon.name} LIKE '%-paldean%Paldean Form%'`);
  // Also handle Mega forms redundancy
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Mega)', '')` }).where(sql`${pokemon.name} LIKE '%-mega%Mega%'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Mega Evolution)', '')` }).where(sql`${pokemon.name} LIKE '%-mega%Mega Evolution%'`);
  // Remove redundant text from Totem forms
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Totem Sized)', '')` }).where(sql`${pokemon.name} LIKE '%-totem%Totem Sized%'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' Totem Sized', '')` }).where(sql`${pokemon.name} LIKE '%-totem%Totem Sized%'`);
  // Koraidon and Miraidon build/mode forms
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Apex Build)', '')` }).where(sql`${pokemon.name} LIKE '% (Apex Build)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Limited Build)', '')` }).where(sql`${pokemon.name} LIKE '% (Limited Build)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Sprinting Build)', '')` }).where(sql`${pokemon.name} LIKE '% (Sprinting Build)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Swimming Build)', '')` }).where(sql`${pokemon.name} LIKE '% (Swimming Build)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Gliding Build)', '')` }).where(sql`${pokemon.name} LIKE '% (Gliding Build)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Ultimate Mode)', '')` }).where(sql`${pokemon.name} LIKE '% (Ultimate Mode)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Low-Power Mode)', '')` }).where(sql`${pokemon.name} LIKE '% (Low-Power Mode)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Drive Mode)', '')` }).where(sql`${pokemon.name} LIKE '% (Drive Mode)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Aquatic Mode)', '')` }).where(sql`${pokemon.name} LIKE '% (Aquatic Mode)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Glide Mode)', '')` }).where(sql`${pokemon.name} LIKE '% (Glide Mode)'`);
  // Unown forms (remove letter designations from display name, keep only "Unown")
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Default Form)', '')` }).where(sql`${pokemon.name} LIKE 'unown%Default Form%'`);
  await db.update(pokemon).set({ name: 'Unown' }).where(sql`${pokemon.speciesName} LIKE 'unown-%'`);
  
  // Remove redundant form descriptions from special forms (e.g., "Rotom-Heat (Heat Rotom)" -> "Rotom-Heat")
  // This is a general cleanup for forms where the form name is repeated in parentheses
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Heat Rotom)', '')` }).where(sql`${pokemon.name} LIKE '% (Heat Rotom)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Wash Rotom)', '')` }).where(sql`${pokemon.name} LIKE '% (Wash Rotom)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Frost Rotom)', '')` }).where(sql`${pokemon.name} LIKE '% (Frost Rotom)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Fan Rotom)', '')` }).where(sql`${pokemon.name} LIKE '% (Fan Rotom)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Mow Rotom)', '')` }).where(sql`${pokemon.name} LIKE '% (Mow Rotom)'`);
  await db.update(pokemon).set({ name: sql`REPLACE(${pokemon.name}, ' (Eternal Flower)', '')` }).where(sql`${pokemon.name} LIKE '% (Eternal Flower)'`);
  
  // Remove all remaining parenthetical descriptions that are redundant
  // This catches patterns like "Pokemon-Form (Form Description)" and removes the parentheses part
  // Using PostgreSQL REGEXP_REPLACE to remove everything from " (" to the end
  await db.execute(sql`
    UPDATE pokemon 
    SET name = REGEXP_REPLACE(name, ' \\(.*\\)$', '')
    WHERE name LIKE '% (%' 
    AND name LIKE '%)'
    AND (
      name LIKE '%-% (%' 
      OR name LIKE '%Rotom%'
      OR name LIKE '%Floette%'
      OR name LIKE '%Deoxys%'
      OR name LIKE '%Wormadam%'
      OR name LIKE '%Giratina%'
      OR name LIKE '%Shaymin%'
      OR name LIKE '%Darmanitan%'
      OR name LIKE '%Tornadus%'
      OR name LIKE '%Thundurus%'
      OR name LIKE '%Landorus%'
      OR name LIKE '%Kyurem%'
      OR name LIKE '%Meloetta%'
      OR name LIKE '%Aegislash%'
      OR name LIKE '%Pumpkaboo%'
      OR name LIKE '%Gourgeist%'
      OR name LIKE '%Hoopa%'
      OR name LIKE '%Oricorio%'
      OR name LIKE '%Lycanroc%'
      OR name LIKE '%Wishiwashi%'
      OR name LIKE '%Minior%'
      OR name LIKE '%Mimikyu%'
      OR name LIKE '%Necrozma%'
      OR name LIKE '%Magearna%'
      OR name LIKE '%Cramorant%'
      OR name LIKE '%Toxtricity%'
      OR name LIKE '%Eiscue%'
      OR name LIKE '%Indeedee%'
      OR name LIKE '%Morpeko%'
      OR name LIKE '%Zacian%'
      OR name LIKE '%Zamazenta%'
      OR name LIKE '%Urshifu%'
      OR name LIKE '%Zarude%'
      OR name LIKE '%Calyrex%'
      OR name LIKE '%Enamorus%'
      OR name LIKE '%Basculegion%'
      OR name LIKE '%Oinkologne%'
      OR name LIKE '%Maushold%'
      OR name LIKE '%Palafin%'
      OR name LIKE '%Tatsugiri%'
      OR name LIKE '%Dudunsparce%'
      OR name LIKE '%Gimmighoul%'
      OR name LIKE '%Koraidon%'
      OR name LIKE '%Miraidon%'
    )
  `);
  
  console.log("Fixed special form generations and names");

  const movesData = await parseCsv('attached_assets/moves_1771232352573.csv');
  await storage.seedMoves(movesData.map((r: any) => ({
    id: parseInt(r.id),
    name: r.name,
    type: TYPE_MAP[r.type_id] || "Normal",
    power: r.power ? parseInt(r.power) : null,
    accuracy: r.accuracy ? parseInt(r.accuracy) : null,
    pp: r.pp ? parseInt(r.pp) : null,
    generationId: parseInt(r.generation_id)
  })));
  console.log("Seeded moves");
  
  const versionMap = new Map();
  versionsData.forEach((v: any) => {
    versionMap.set(v.identifier, parseInt(v.id));
  });

  console.log("Loading pokemon_moves CSV...");
  const pmData = await parseCsv('attached_assets/pokemon_moves_1771232352573.csv');
  console.log(`Loaded ${pmData.length} pokemon_moves rows from CSV`);
  
  const mappedPM = [];
  for (const r of pmData) {
     const vId = versionMap.get(r.version_identifier);
     if (vId) {
       mappedPM.push({
         pokemonId: parseInt(r.pokemon_form_id),
         moveId: parseInt(r.move_id),
         versionGroupId: vId,
         level: parseInt(r.level),
         method: r.pokemon_move_method_id
       });
     }
  }
  
  console.log(`Mapped ${mappedPM.length} pokemon moves. Seeding...`);
  try {
    await storage.seedPokemonMoves(mappedPM);
    console.log("✓ Seeded pokemon moves");
  } catch (error) {
    console.error("✗ Error seeding pokemon moves:", error);
    throw error;
  }

  // Seed evolutions
  console.log("Starting evolution seeding...");
  try {
    // Use ndex_evolution_trees.csv which maps ndex_id to evolution_tree_id
    const ndexEvolutionData = await parseCsv('attached_assets/ndex_evolution_trees.csv');
    console.log(`Loaded ${ndexEvolutionData.length} ndex evolution mappings from CSV`);
    
    // Get all Pokemon from database
    const allPokemon = await db.select({
      id: pokemon.id,
      name: pokemon.name,
      ndexId: pokemon.ndexId,
      speciesName: pokemon.speciesName
    }).from(pokemon);
    
    console.log(`Total Pokemon in database: ${allPokemon.length}`);
    
    // Group Pokemon by evolution tree
    const evolutionTrees = new Map<number, number[]>();
    ndexEvolutionData.forEach((row: any) => {
      const ndexId = parseInt(row.ndex_id);
      const treeId = parseInt(row.evolution_tree_id);
      
      if (!evolutionTrees.has(treeId)) {
        evolutionTrees.set(treeId, []);
      }
      evolutionTrees.get(treeId)!.push(ndexId);
    });
    
    console.log(`Grouped into ${evolutionTrees.size} evolution trees`);
    
    // Build evolution relationships
    const mappedEvolutions: any[] = [];
    
    evolutionTrees.forEach((ndexIds, treeId) => {
      // Sort by ndex_id (lower number = earlier evolution stage)
      ndexIds.sort((a, b) => a - b);
      
      // Create evolution chain: each Pokemon evolves into the next one
      for (let i = 0; i < ndexIds.length - 1; i++) {
        const currentNdex = ndexIds[i];
        const nextNdex = ndexIds[i + 1];
        
        // Find all Pokemon forms with these ndex IDs (including regional forms)
        const currentForms = allPokemon.filter(p => p.ndexId === currentNdex);
        const nextForms = allPokemon.filter(p => p.ndexId === nextNdex);
        
        // Prioritize default forms
        const getDefaultOrFirst = (forms: typeof allPokemon) => {
          const defaultForm = forms.find(f => f.speciesName.includes('default'));
          return defaultForm || forms[0];
        };
        
        // Match default forms (or first available form)
        for (const currentForm of currentForms) {
          // Try to find matching evolution form (same regional variant)
          let nextForm = nextForms.find(nf => {
            // Match regional variants
            if (currentForm.speciesName.includes('alolan')) return nf.speciesName.includes('alolan');
            if (currentForm.speciesName.includes('galarian')) return nf.speciesName.includes('galarian');
            if (currentForm.speciesName.includes('hisuian')) return nf.speciesName.includes('hisuian');
            if (currentForm.speciesName.includes('paldean')) return nf.speciesName.includes('paldean');
            // Default form
            return nf.speciesName.includes('default') || !nf.speciesName.includes('-');
          });
          
          // If no match found, use default or first form
          if (!nextForm && nextForms.length > 0) {
            nextForm = getDefaultOrFirst(nextForms);
          }
          
          if (nextForm) {
            // Skip if this is not a default form and we already have a default evolution
            const isDefaultCurrent = currentForm.speciesName.includes('default');
            const isDefaultNext = nextForm.speciesName.includes('default');
            
            // Only create evolution if both are default forms, or if no default forms exist
            if ((isDefaultCurrent && isDefaultNext) || 
                (!currentForms.some(f => f.speciesName.includes('default')) && 
                 !nextForms.some(f => f.speciesName.includes('default')))) {
              
              mappedEvolutions.push({
                evolvedSpeciesId: currentForm.id,
                evolvesIntoSpeciesId: nextForm.id,
                evolutionTriggerId: null,
                minLevel: null
              });
              
              // Log first few for debugging
              if (mappedEvolutions.length <= 10) {
                console.log(`Evolution ${mappedEvolutions.length}: ${currentForm.name} (ID:${currentForm.id}, Ndex:${currentNdex}) -> ${nextForm.name} (ID:${nextForm.id}, Ndex:${nextNdex})`);
              }
            }
          }
        }
      }
    });
    
    console.log(`Mapped ${mappedEvolutions.length} total evolutions`);
    if (mappedEvolutions.length > 0) {
      await storage.seedEvolutions(mappedEvolutions);
      console.log("✓ Seeded evolutions successfully");
    } else {
      console.log("⚠ WARNING: No evolutions were mapped!");
    }
  } catch (error) {
    console.error("✗ Error during evolution seeding:", error);
    // Don't throw - let the rest of the app work even if evolutions fail
  }
}

function parseCsv(filePath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    fs.createReadStream(path.resolve(process.cwd(), filePath))
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}
