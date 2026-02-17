
import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import fs from "fs";
import path from "path";
import csv from "csv-parser";

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
      
      let attempts = 0;
      let roundData = null;
      let response = null;

      // Try to find a valid unique moveset up to 10 times
      while (attempts < 10) {
        attempts++;
        
        // 1. Get a random Pokemon
        const [targetPokemon] = await storage.getRandomPokemon(maxGen, 1);
        if (!targetPokemon) continue;

        // 2. Get valid moves
        const validMoves = await storage.getMovesForPokemon(targetPokemon.id, maxGen);
        if (validMoves.length < 4) continue;
        
        // 3. Select 4 random unique moves
        const shuffledMoves = validMoves.sort(() => 0.5 - Math.random());
        const selectedMoves = shuffledMoves.slice(0, 4);
        const moveIds = selectedMoves.map(m => m.id);

        // 4. Check Uniqueness
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

      if (response) {
        res.json(response);
      } else {
        res.status(500).json({ message: "Failed to generate a unique moveset puzzle after multiple attempts. Please try again." });
      }

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
        if (points < 0) points = 0;
      }

      let correctPokemon = undefined;
      if (!isCorrect && attempt >= 3) {
         correctPokemon = await storage.getPokemon(roundData.correctPokemonId);
      }
      if (isCorrect) {
         correctPokemon = await storage.getPokemon(roundData.correctPokemonId);
      }

      res.json({
        correct: isCorrect,
        points,
        correctPokemon,
        livesRemaining: isCorrect ? 3 : (3 - attempt)
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

  app.get(api.pokedex.list.path, async (req, res) => {
    const maxGen = req.query.maxGen ? parseInt(req.query.maxGen as string) : undefined;
    const search = req.query.search as string;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    const result = await storage.getAllPokemon(maxGen, search, limit, offset);
    res.json(result);
  });

  app.get(api.pokedex.search.path, async (req, res) => {
    const query = req.query.query as string;
    const maxGen = parseInt(req.query.maxGen as string);
    if (!query || isNaN(maxGen)) return res.json([]);
    
    const result = await storage.searchPokemon(query, maxGen);
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
    
    if (formName.includes("Alolan")) gen = 7;
    if (formName.includes("Galarian")) gen = 8;
    if (formName.includes("Hisuian")) gen = 8;
    if (formName.includes("Paldean")) gen = 9;
    if (formName.includes("Mega")) gen = gen < 6 ? 6 : gen;
    if (formName.includes("Gigantamax")) gen = 8;

    return {
      id: parseInt(r.id),
      name: r.form_name ? `${r.identifier} (${r.form_name})` : r.identifier,
      speciesName: r.identifier,
      generationId: gen,
      type1: TYPE_MAP[r.type_1_id] || "Unknown",
      type2: r.type_2_id ? (TYPE_MAP[r.type_2_id] || null) : null,
      imageUrl: r.main_image_normal_path,
      cryUrl: r.pokemon_cry_path
    };
  });

  await storage.seedPokemon(mappedPokemon);
  console.log("Seeded pokemon");

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

  const pmData = await parseCsv('attached_assets/pokemon_moves_1771232352573.csv');
  
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
