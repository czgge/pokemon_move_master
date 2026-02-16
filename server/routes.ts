
import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import fs from "fs";
import path from "path";
import csv from "csv-parser";

// Helper to encrypt/decrypt round tokens (simple base64 for now, ideally JWT)
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
      const { maxGen } = api.game.start.input.parse(req.body);
      
      // 1. Get a random Pokemon that is valid for this generation filter
      const [targetPokemon] = await storage.getRandomPokemon(maxGen, 1);
      
      if (!targetPokemon) {
        return res.status(500).json({ message: "No Pokemon found for this generation." });
      }

      // 2. Get moves valid for this pokemon in the selected generation range
      const validMoves = await storage.getMovesForPokemon(targetPokemon.id, maxGen);
      
      if (validMoves.length < 4) {
        // If pokemon has fewer than 4 moves, we might need another pokemon or just show what it has
        // For game stability, let's retry once or accept it (simple approach: accept)
      }
      
      // 3. Select 4 random unique moves
      const shuffledMoves = validMoves.sort(() => 0.5 - Math.random());
      const selectedMoves = shuffledMoves.slice(0, 4);

      // 4. Generate options (distractors)
      // Distractors should ideally be from similar generation or random
      const distractors = await storage.getRandomPokemon(maxGen, 5); 
      // Ensure target is in options
      const options = [targetPokemon, ...distractors.filter(d => d.id !== targetPokemon.id)].slice(0, 6); // Max 6 options
      const shuffledOptions = options.sort(() => 0.5 - Math.random());

      const roundId = Math.random().toString(36).substring(7);
      
      const roundData = {
        roundId,
        correctPokemonId: targetPokemon.id,
        moves: selectedMoves.map(m => m.name),
        gen: maxGen
      };

      res.json({
        roundId,
        moves: roundData.moves,
        generation: maxGen,
        options: shuffledOptions.map(o => ({
          id: o.id,
          name: o.name,
          imageUrl: o.imageUrl
        })),
        roundToken: createRoundToken(roundData)
      });

    } catch (error) {
       console.error(error);
       res.status(500).json({ message: "Failed to start round" });
    }
  });

  app.post(api.game.answer.path, async (req, res) => {
    try {
      const { roundToken, guessedPokemonId, attempt, hintsUsed } = api.game.answer.input.parse(req.body);
      const roundData = decodeRoundToken(roundToken);
      
      if (!roundData) {
        return res.status(400).json({ message: "Invalid token" });
      }

      const isCorrect = roundData.correctPokemonId === guessedPokemonId;
      let points = 0;

      if (isCorrect) {
        if (attempt === 1) points = 5;
        else if (attempt === 2) points = 4;
        else if (attempt === 3) points = 3;
        
        points -= hintsUsed; 
        if (points < 0) points = 0; // Prevent negative score? Rules say hints give -1.
      }

      let correctPokemon = undefined;
      // If wrong and used all attempts (attempt 3), reveal answer
      if (!isCorrect && attempt >= 3) {
         correctPokemon = await storage.getPokemon(roundData.correctPokemonId);
      }

      // If correct, also return pokemon details for display
      if (isCorrect) {
         correctPokemon = await storage.getPokemon(roundData.correctPokemonId);
      }

      res.json({
        correct: isCorrect,
        points,
        correctPokemon,
        livesRemaining: isCorrect ? 3 : (3 - attempt) // Logic handled on frontend mostly, but this confirms status
      });

    } catch (error) {
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

  // --- Pokedex & Leaderboard ---

  app.get(api.pokedex.list.path, async (req, res) => {
    const maxGen = req.query.maxGen ? parseInt(req.query.maxGen as string) : undefined;
    const search = req.query.search as string;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    const result = await storage.getAllPokemon(maxGen, search, limit, offset);
    res.json(result);
  });

  app.get(api.leaderboard.list.path, async (req, res) => {
    const scores = await storage.getHighScores();
    res.json(scores);
  });

  app.post(api.leaderboard.submit.path, async (req, res) => {
    const entry = await storage.createHighScore(req.body);
    res.status(201).json(entry);
  });

  // --- Seeding Endpoint (Hidden/Auto) ---
  // In a real app we'd run a script. Here we can check on startup.
  seedDatabase().catch(console.error);

  return httpServer;
}

// --- Seeding Logic ---

async function seedDatabase() {
  const isSeeded = await storage.isSeeded();
  if (isSeeded) {
    console.log("Database already seeded.");
    return;
  }
  
  console.log("Starting database seed...");

  // 1. Generations
  const generationsData = await parseCsv('attached_assets/generations_1771232352572.csv');
  await storage.seedGenerations(generationsData.map((r: any) => ({
    id: parseInt(r.id),
    name: r.name
  })));
  console.log("Seeded generations");

  // 2. Versions (Needed for mapping moves)
  // versions.csv: identifier, ..., generation_id, ... id
  const versionsData = await parseCsv('attached_assets/versions_1771232352575.csv');
  await storage.seedVersions(versionsData.map((r: any) => ({
    id: parseInt(r.id),
    name: r.name,
    identifier: r.identifier,
    generationId: parseInt(r.generation_id)
  })));
  console.log("Seeded versions");

  // 3. Pokemon
  // pokemon_forms.csv has the detailed info
  // Columns: id, pokemon_id, identifier, form_name, type_1_id, type_2_id, ...
  // Wait, type_1_id is an ID. We need types table? Or just map it.
  // The CSV provided doesn't have a types.csv. pokemon_forms.csv has type IDs?
  // Checking `attached_assets/pokemon_forms_1771232352573.csv`:
  // id,ndex_id,identifier,form_name,type_1_id,type_2_id,...
  // It seems we might need a types mapping or just store the ID if we don't have the types names.
  // Actually, let's check `pokemon.csv` if it exists. Not provided in list.
  // Wait, `pokemon_forms` has `type_1_id`.
  // Standard Type IDs: 1=Normal, 2=Fighting, etc.
  // Hardcoding types map for MVP since types.csv is missing.
  
  const TYPE_MAP: Record<string, string> = {
    "1": "Normal", "2": "Fighting", "3": "Flying", "4": "Poison", "5": "Ground", 
    "6": "Rock", "7": "Bug", "8": "Ghost", "9": "Steel", "10": "Fire", 
    "11": "Water", "12": "Grass", "13": "Electric", "14": "Psychic", "15": "Ice", 
    "16": "Dragon", "17": "Dark", "18": "Fairy"
  };

  const pokemonData = await parseCsv('attached_assets/pokemon_forms_1771232352573.csv');
  
  // Need to determine Generation for each Pokemon.
  // `pokemon_forms` doesn't strictly say generation.
  // `pokemon.csv` usually has `species_id` which links to `pokemon_species.csv` which has `generation_id`.
  // We don't have `pokemon_species.csv`.
  // Heuristic: Use `ndex_id` (National Dex ID).
  // Gen 1: 1-151, Gen 2: 152-251, etc.
  
  function getGenFromDex(id: number): number {
    if (id <= 151) return 1;
    if (id <= 251) return 2;
    if (id <= 386) return 3;
    if (id <= 493) return 4;
    if (id <= 649) return 5;
    if (id <= 721) return 6;
    if (id <= 809) return 7;
    if (id <= 905) return 8; // approx
    return 9;
  }

  // Handle Alolan/Galar forms: The user said "pikachu alolan should not be considered in gen 1 but in gen 7".
  // `pokemon_forms` has `form_name`. If it's "Alolan", it's Gen 7. "Galarian" Gen 8. "Hisuian" Gen 8 (Legends). "Paldean" Gen 9.
  
  const mappedPokemon = pokemonData.map((r: any) => {
    let gen = getGenFromDex(parseInt(r.ndex_id));
    const formName = r.form_name || "";
    
    if (formName.includes("Alolan")) gen = 7;
    if (formName.includes("Galarian")) gen = 8;
    if (formName.includes("Hisuian")) gen = 8;
    if (formName.includes("Paldean")) gen = 9;
    if (formName.includes("Mega")) gen = gen < 6 ? 6 : gen; // Megas introduced Gen 6
    if (formName.includes("Gigantamax")) gen = 8;

    return {
      id: parseInt(r.id), // Form ID
      name: r.form_name ? `${r.identifier} (${r.form_name})` : r.identifier,
      speciesName: r.identifier,
      generationId: gen,
      type1: TYPE_MAP[r.type_1_id] || "Unknown",
      type2: r.type_2_id ? (TYPE_MAP[r.type_2_id] || null) : null,
      imageUrl: r.main_image_normal_path, // from CSV
      cryUrl: r.pokemon_cry_path // from CSV
    };
  });

  await storage.seedPokemon(mappedPokemon);
  console.log("Seeded pokemon");

  // 4. Moves
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

  // 5. Pokemon Moves (The big one)
  // pokemon_moves.csv: pokemon_form_id, version_identifier, move_id, pokemon_move_method_id, level
  // We need to map version_identifier to version_group_id -> version_id.
  // Actually, our `pokemonMoves` schema has `versionGroupId`.
  // We seeded `versions` table with `identifier` and `id`.
  // Let's create a map of version identifier -> id.
  
  const versionMap = new Map();
  versionsData.forEach((v: any) => {
    versionMap.set(v.identifier, parseInt(v.id));
  });

  const pmData = await parseCsv('attached_assets/pokemon_moves_1771232352573.csv');
  
  // This file is 600k lines. In-memory loading might crash a small container.
  // `csv-parser` streams, but `parseCsv` below accumulates.
  // We should modify `parseCsv` or process in chunks.
  // For this environment, let's just take the first 50,000 moves or implement a stream reader if possible.
  // Or better, since this is a demo, we rely on the snippet or assume we can handle it.
  // Replit standard memory might handle 600k objects (~100MB JSON), but let's be safe.
  
  // NOTE: For the sake of the user's request, we need ACCURATE moves.
  // We will map only a subset if we hit limits, but ideally all.
  
  const mappedPM = [];
  for (const r of pmData) {
     const vId = versionMap.get(r.version_identifier);
     if (vId) {
       mappedPM.push({
         pokemonId: parseInt(r.pokemon_form_id),
         moveId: parseInt(r.move_id),
         versionGroupId: vId,
         level: parseInt(r.level),
         method: r.pokemon_move_method_id // 1=level, 4=machine? We just store ID for now or map later
       });
     }
  }
  
  console.log(`Mapped ${mappedPM.length} pokemon moves. Seeding...`);
  await storage.seedPokemonMoves(mappedPM);
  console.log("Seeded pokemon moves");
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
