# PokéGuess - Pokémon Moveset Guessing Game

## Overview

PokéGuess is a Pokémon trivia game where players guess which Pokémon a set of moves belongs to. The app presents 4 unique moves and the player must identify the correct Pokémon. It features a retro/pixel art aesthetic inspired by the Game Boy era, with lives-based gameplay, a hint system, score tracking, a leaderboard, and a Pokédex browser.

The project follows a monorepo structure with a React frontend (Vite), Express backend, PostgreSQL database (Drizzle ORM), and shared type definitions between client and server.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Directory Structure
- `client/` — React frontend (Vite + TypeScript)
- `server/` — Express backend (TypeScript, compiled with tsx/esbuild)
- `shared/` — Shared schema definitions and API route contracts (used by both client and server)
- `migrations/` — Drizzle-generated database migrations
- `script/` — Build scripts

### Frontend Architecture
- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query for server state; local React state for game logic
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives, with custom retro-themed components (`RetroButton`, `RetroCard`, `MoveCard`, `PokemonCombobox`, `PokemonSprite`, `GameHeader`)
- **Styling**: Tailwind CSS with CSS variables for theming; retro pixel fonts (Press Start 2P, VT323) and a Game Boy-inspired color palette
- **Animations**: Framer Motion for transitions and game animations; canvas-confetti for victory effects
- **Search**: cmdk-based combobox with debounced search for Pokémon autocomplete
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Pages
- `/` — Home page with navigation to game, Pokédex, leaderboard
- `/game/setup` — Generation selection (1–9) with slider
- `/game/play` — Main gameplay: move cards, Pokémon guessing, lives, scoring, hints
- `/leaderboard` — High scores table
- `/pokedex` — Paginated/searchable Pokémon browser

### Backend Architecture
- **Framework**: Express.js on Node.js with TypeScript (run via tsx in dev, esbuild bundle for production)
- **API Design**: REST API with typed route contracts defined in `shared/routes.ts` using Zod schemas. The `api` object defines paths, methods, input schemas, and response schemas, shared between client and server.
- **Game Logic**: Server-side round management using base64-encoded "round tokens" that encode the correct answer. This prevents cheating by keeping the answer server-side.
- **Data Seeding**: Pokémon data (generations, versions, Pokémon, moves, move mappings) is seeded from CSV files into PostgreSQL
- **Static Serving**: In production, serves the Vite-built frontend from `dist/public`; in development, uses Vite middleware with HMR

### Key API Endpoints
- `POST /api/game/start` — Start a new round (input: maxGen; returns: moves, roundToken)
- `POST /api/game/answer` — Submit a guess (input: roundToken, guessedPokemonId, attempt, hintsUsed)
- `POST /api/game/hint` — Request a hint for the current round
- `GET /api/pokemon/search` — Search Pokémon by name (for autocomplete)
- `GET /api/pokedex/list` — Paginated Pokémon listing
- `GET /api/leaderboard` — Get top 50 high scores
- `POST /api/leaderboard` — Submit a high score

### Database
- **Engine**: PostgreSQL (required, via `DATABASE_URL` environment variable)
- **ORM**: Drizzle ORM with `drizzle-kit` for schema management
- **Schema** (in `shared/schema.ts`):
  - `generations` — Pokémon generation metadata
  - `versions` — Game version groups
  - `pokemon` — Pokémon with types, images, cry URLs, generation
  - `moves` — Move data (name, type, power, accuracy, PP)
  - `pokemon_moves` — Many-to-many junction table (Pokémon ↔ Moves with version group and learn method)
  - `high_scores` — Leaderboard entries
- **Schema push**: Use `npm run db:push` (runs `drizzle-kit push`)

### Storage Layer
- `server/storage.ts` defines an `IStorage` interface implemented by `DatabaseStorage`
- Key methods: `getRandomPokemon()`, `getMovesForPokemon()`, `checkUniqueMoveset()`, `searchPokemon()`, seeding helpers
- The game logic ensures the selected 4 moves form a "unique moveset" — only one Pokémon can learn all 4 moves in the given generation range

### Build System
- **Dev**: `npm run dev` — tsx runs the Express server with Vite middleware for HMR
- **Build**: `npm run build` — Vite builds the client to `dist/public`, esbuild bundles the server to `dist/index.cjs`
- **Start**: `npm run start` — Runs the production bundle
- **Type Check**: `npm run check` — TypeScript check across all code

## External Dependencies

### Required Services
- **PostgreSQL Database**: Required. Connection via `DATABASE_URL` environment variable. Used for all game data storage, Pokémon data, and leaderboard.

### Key NPM Packages
- **Frontend**: React, Vite, Wouter, TanStack React Query, Framer Motion, canvas-confetti, cmdk, shadcn/ui (Radix UI primitives), Tailwind CSS
- **Backend**: Express, Drizzle ORM, pg (node-postgres), connect-pg-simple, csv-parser, Zod
- **Shared**: Zod (validation), drizzle-zod (schema-to-zod conversion)
- **Build**: esbuild, tsx, Vite

### External APIs / Data Sources
- Pokémon sprite images referenced via `imageUrl` field (likely from PokeAPI or similar CDN)
- Pokémon cry audio referenced via `cryUrl` field
- Google Fonts: Press Start 2P, VT323, DM Sans, Fira Code, Geist Mono, Architects Daughter
- Replit-specific Vite plugins for dev experience (`@replit/vite-plugin-runtime-error-modal`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`)