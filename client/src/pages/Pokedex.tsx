import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import { RetroCard } from "@/components/RetroCard";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Loader2, Search, X, Filter, ChevronDown } from "lucide-react";
import { RetroButton } from "@/components/RetroButton";
import { useDebounce } from "@/hooks/use-debounce";
import { MoveCard } from "@/components/MoveCard";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { MovesetValidator } from "@/components/MovesetValidator";

export default function Pokedex() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  const [selectedPokemon, setSelectedPokemon] = useState<any>(null);
  const [selectedGen, setSelectedGen] = useState<number>(1);
  const [maxGen, setMaxGen] = useState<number>(9);
  const [moveFilters, setMoveFilters] = useState<string[]>([]);
  const [moveSearch, setMoveSearch] = useState("");
  const debouncedMoveSearch = useDebounce(moveSearch, 300);
  const [showMoveSuggestions, setShowMoveSuggestions] = useState(false);
  const moveSearchRef = useRef<HTMLDivElement>(null);
  const [pokemonMoveSearch, setPokemonMoveSearch] = useState(""); // For searching within Pokemon modal
  const [activeTab, setActiveTab] = useState<"browse" | "validator">("browse"); // Tab state

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moveSearchRef.current && !moveSearchRef.current.contains(event.target as Node)) {
        setShowMoveSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const { data, isLoading } = useQuery({
    queryKey: [api.pokedex.list.path, debouncedSearch, page, maxGen, moveFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (maxGen) params.append("maxGen", maxGen.toString());
      if (moveFilters.length > 0) params.append("moves", moveFilters.join(','));
      params.append("page", page.toString());
      
      const res = await fetch(`${api.pokedex.list.path}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed");
      return api.pokedex.list.responses[200].parse(await res.json());
    }
  });

  const { data: moveSuggestions, error: moveSuggestionsError } = useQuery({
    queryKey: ["/api/moves/search", debouncedMoveSearch, maxGen],
    queryFn: async () => {
      if (!debouncedMoveSearch || debouncedMoveSearch.length < 2) return [];
      console.log("Fetching moves for query:", debouncedMoveSearch, "gen:", maxGen);
      const res = await fetch(`/api/moves/search?query=${debouncedMoveSearch}&gen=${maxGen}`);
      if (!res.ok) {
        console.error("Move search failed:", res.status, await res.text());
        return [];
      }
      const data = await res.json();
      console.log("Move suggestions received:", data);
      return data;
    },
    enabled: debouncedMoveSearch.length >= 2
  });

  useEffect(() => {
    console.log("moveSuggestions:", moveSuggestions);
    console.log("showMoveSuggestions:", showMoveSuggestions);
    console.log("debouncedMoveSearch:", debouncedMoveSearch);
  }, [moveSuggestions, showMoveSuggestions, debouncedMoveSearch]);

  const { data: moves, isLoading: isLoadingMoves } = useQuery({
    queryKey: ["/api/pokemon/moves", selectedPokemon?.id, selectedGen],
    queryFn: async () => {
      if (!selectedPokemon) return [];
      const res = await fetch(`/api/pokemon/${selectedPokemon.id}/moves?gen=${selectedGen}`);
      if (!res.ok) throw new Error("Failed to fetch moves");
      return await res.json();
    },
    enabled: !!selectedPokemon
  });

  const formatName = (name: string) => {
    if (!name) return "";
    
    // Remove "-default" suffix
    let formatted = name.replace(/-default.*/, "");
    
    // Handle cases like "arceus-fighting (Fighting Form)" or "charizard (Mega Evolution X)"
    const match = formatted.match(/^([^(]+)\s*\((.+)\)$/);
    if (match) {
      let baseName = match[1].trim().replace(/-/g, " ");
      const formName = match[2].trim();
      
      // Split base name into words
      const baseWords = baseName.toLowerCase().split(/\s+/);
      const formWords = formName.toLowerCase().split(/\s+/);
      
      // Get the species name (first word)
      const baseSpecies = baseWords[0];
      const baseDescriptors = baseWords.slice(1); // e.g., ["fighting"] from "arceus fighting"
      
      // Check if form name contains the base descriptors (redundant info)
      const redundantWords = baseDescriptors.filter(desc => formWords.includes(desc));
      
      if (redundantWords.length > 0) {
        // Remove redundant words from form name
        // e.g., "Fighting Form" with redundant "fighting" -> "Form"
        let cleanedFormWords = formWords.filter(word => !redundantWords.includes(word));
        
        // Capitalize properly
        const cleanedForm = cleanedFormWords
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
        
        // Return "Species Descriptor Form" (e.g., "Arceus Fighting Form")
        const capitalizedSpecies = baseSpecies.charAt(0).toUpperCase() + baseSpecies.slice(1);
        const capitalizedDescriptors = baseDescriptors
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
        
        return `${capitalizedSpecies} ${capitalizedDescriptors} ${cleanedForm}`.trim();
      } else {
        // No redundancy, return "Species (Form)" format
        // e.g., "Charizard (Mega Evolution X)" -> "Charizard Mega Evolution X"
        const capitalizedSpecies = baseSpecies.charAt(0).toUpperCase() + baseSpecies.slice(1);
        return `${capitalizedSpecies} ${formName}`;
      }
    }
    
    // No parentheses, just replace hyphens and capitalize
    return formatted.split(/\s+/).map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(" ");
  };

  const addMoveFilter = (moveName: string) => {
    const formatted = moveName.toLowerCase().replace(/ /g, '-');
    if (!moveFilters.includes(formatted) && moveFilters.length < 4) {
      setMoveFilters([...moveFilters, formatted]);
      setPage(1);
      setMoveSearch("");
      setShowMoveSuggestions(false);
    }
  };

  const removeMoveFilter = (moveName: string) => {
    setMoveFilters(moveFilters.filter(m => m !== moveName));
    setPage(1);
  };

  // Filter moves based on search
  const filteredMoves = moves?.filter((move: any) => {
    if (!pokemonMoveSearch) return true;
    const searchLower = pokemonMoveSearch.toLowerCase();
    const moveName = move.name.toLowerCase().replace(/-/g, ' ');
    return moveName.includes(searchLower);
  }) || [];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="flex flex-col gap-6 mb-8">
          <h1 className="text-3xl md:text-4xl font-retro text-foreground tracking-tighter uppercase text-center md:text-left">POKÉDEX</h1>

          {/* Tabs */}
          <div className="flex gap-2 border-b-2 border-border">
            <button
              onClick={() => setActiveTab("browse")}
              className={cn(
                "px-6 py-3 font-retro text-base uppercase transition-colors border-b-4",
                activeTab === "browse"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Browse Pokémon
            </button>
            <button
              onClick={() => setActiveTab("validator")}
              className={cn(
                "px-6 py-3 font-retro text-base uppercase transition-colors border-b-4",
                activeTab === "validator"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Moveset Validator
            </button>
          </div>

          {activeTab === "browse" && (
          <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Pokemon Search Filter */}
            <div className="bg-muted/30 p-4 rounded-lg pixel-border-sm">
              <label className="font-retro text-xs uppercase text-muted-foreground block mb-2">
                🔍 Pokémon Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input 
                  placeholder="Search Pokémon..."
                  className="w-full pl-10 pr-10 py-2 rounded border-2 border-border focus:border-primary focus:outline-none font-mono text-sm"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
                {search && (
                  <button 
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Generation Filter */}
            <div className="bg-muted/30 p-4 rounded-lg pixel-border-sm">
              <label className="font-retro text-xs uppercase text-muted-foreground block mb-2">
                🎮 Generation Filter
              </label>
              <select 
                className="w-full bg-white border-2 border-border rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary"
                value={maxGen}
                onChange={(e) => { setMaxGen(parseInt(e.target.value)); setPage(1); }}
              >
                {[1,2,3,4,5,6,7,8,9].map(g => <option key={g} value={g}>Generation {g}</option>)}
              </select>
            </div>

            {/* Move Filter */}
            <div className="bg-muted/30 p-4 rounded-lg pixel-border-sm">
              <label className="font-retro text-xs uppercase text-muted-foreground block mb-2">
                ⚔️ Move Combination Filter (max 4)
              </label>
              <div className="relative" ref={moveSearchRef}>
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input 
                  placeholder="Type move name to add..."
                  className="w-full pl-10 pr-4 py-2 rounded border-2 border-border focus:border-primary focus:outline-none font-mono text-sm"
                  value={moveSearch}
                  onChange={(e) => {
                    setMoveSearch(e.target.value);
                    setShowMoveSuggestions(true);
                  }}
                  onFocus={() => setShowMoveSuggestions(true)}
                  disabled={moveFilters.length >= 4}
                />
                
                <AnimatePresence>
                  {showMoveSuggestions && moveSuggestions && moveSuggestions.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute left-0 right-0 top-full mt-1 bg-white border-2 border-border rounded-lg shadow-lg z-50 overflow-hidden max-h-60 overflow-y-auto"
                    >
                      {moveSuggestions.map((move: any) => (
                        <button
                          key={move.id}
                          type="button"
                          className="w-full text-left px-4 py-2 hover:bg-primary/10 transition-colors font-mono text-xs border-b last:border-0 border-border flex items-center justify-between group"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addMoveFilter(move.name);
                          }}
                        >
                          <span className="capitalize">{move.name.replace(/-/g, ' ')}</span>
                          <span className={cn("text-[8px] px-1.5 py-0.5 rounded uppercase font-bold", `type-${move.type.toLowerCase()}`)}>
                            {move.type}
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              {moveFilters.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {moveFilters.map(move => (
                    <span key={move} className="bg-primary/10 text-primary border-2 border-primary/20 px-2 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-1">
                      {move.replace(/-/g, " ")}
                      <button onClick={() => removeMoveFilter(move)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  <button onClick={() => setMoveFilters([])} className="text-[10px] font-bold text-muted-foreground hover:text-primary uppercase underline">Clear All</button>
                </div>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {data?.items.map((pokemon) => (
                <RetroCard 
                  key={pokemon.id} 
                  className="group hover:border-primary transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedPokemon(pokemon);
                    setSelectedGen(pokemon.generationId);
                    setPokemonMoveSearch(""); // Reset search when opening new Pokemon
                  }}
                >
                  <div className="relative aspect-square bg-muted/30 rounded-lg mb-3 flex items-center justify-center p-4">
                    <span className="absolute top-2 left-2 text-[10px] font-mono text-muted-foreground">#{pokemon.id}</span>
                    {pokemon.imageUrl ? (
                      <img 
                        src={pokemon.imageUrl} 
                        alt={pokemon.name} 
                        className="w-full h-full object-contain pixelated group-hover:scale-110 transition-transform duration-300" 
                      />
                    ) : (
                      <div className="w-16 h-16 bg-muted rounded-full" />
                    )}
                  </div>
                  
                  <h3 className="font-bold text-center capitalize mb-2 truncate px-1 text-xs md:text-sm">
                    {formatName(pokemon.name)}
                  </h3>
                  
                  <div className="flex justify-center gap-1">
                    <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-bold type-${pokemon.type1.toLowerCase()}`}>
                      {pokemon.type1}
                    </span>
                    {pokemon.type2 && (
                      <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-bold type-${pokemon.type2.toLowerCase()}`}>
                        {pokemon.type2}
                      </span>
                    )}
                  </div>
                </RetroCard>
              ))}
            </div>

            {data?.total === 0 && (
              <div className="text-center py-20">
                <p className="font-retro text-muted-foreground">NO POKÉMON FOUND</p>
                <p className="text-xs text-muted-foreground mt-2 font-mono">Try adjusting your filters</p>
              </div>
            )}

            {data && data.total > 20 && (
              <div className="flex justify-center gap-4 mt-8">
                <RetroButton 
                  variant="outline" 
                  onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo(0, 0); }}
                  disabled={page === 1}
                >
                  Prev
                </RetroButton>
                <span className="flex items-center font-mono text-sm">Page {page} of {Math.ceil(data.total / 20)}</span>
                <RetroButton 
                  variant="outline" 
                  onClick={() => { setPage(p => p + 1); window.scrollTo(0, 0); }}
                  disabled={page >= Math.ceil(data.total / 20)}
                >
                  Next
                </RetroButton>
              </div>
            )}
          </>
        )}
        </>
      )}

      {activeTab === "validator" && (
        <MovesetValidator maxGen={maxGen} onGenChange={setMaxGen} />
      )}
    </div>
  </div>

  <AnimatePresence>
        {selectedPokemon && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedPokemon(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white rounded-lg pixel-border p-4 lg:p-6 flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setSelectedPokemon(null)}
                className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full transition-colors z-20"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 mb-6 overflow-hidden flex-1">
                <div className="w-full lg:w-1/4 flex flex-col items-center shrink-0">
                  <div className="w-32 h-32 lg:w-40 lg:h-40 bg-muted/30 rounded-lg p-4 mb-3 flex items-center justify-center">
                    <img 
                      src={selectedPokemon.imageUrl} 
                      alt={selectedPokemon.name} 
                      className="w-full h-full object-contain pixelated"
                    />
                  </div>
                  <h2 className="text-lg lg:text-xl font-retro text-center mb-2 tracking-tighter uppercase">{formatName(selectedPokemon.name)}</h2>
                  <div className="flex justify-center gap-2 mb-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold type-${selectedPokemon.type1.toLowerCase()}`}>
                      {selectedPokemon.type1}
                    </span>
                    {selectedPokemon.type2 && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold type-${selectedPokemon.type2.toLowerCase()}`}>
                        {selectedPokemon.type2}
                      </span>
                    )}
                  </div>
                  
                  {/* Base Stats - Compact on mobile, full on desktop */}
                  {selectedPokemon.hp && (
                    <div className="w-full bg-muted/20 p-3 lg:p-4 rounded-lg mb-3 lg:mb-4 border-2 border-border">
                      <p className="text-xs font-bold uppercase text-center mb-2 lg:mb-4 text-muted-foreground">Base Stats</p>
                      {/* Mobile: Compact horizontal layout */}
                      <div className="lg:hidden grid grid-cols-3 gap-2 text-center">
                        {[
                          { label: 'HP', value: selectedPokemon.hp, color: 'bg-green-500' },
                          { label: 'ATK', value: selectedPokemon.attack, color: 'bg-red-500' },
                          { label: 'DEF', value: selectedPokemon.defense, color: 'bg-yellow-500' },
                          { label: 'SPA', value: selectedPokemon.specialAttack, color: 'bg-blue-500' },
                          { label: 'SPD', value: selectedPokemon.specialDefense, color: 'bg-purple-500' },
                          { label: 'SPE', value: selectedPokemon.speed, color: 'bg-pink-500' }
                        ].map(stat => (
                          <div key={stat.label} className="flex flex-col items-center">
                            <span className="text-[10px] font-mono font-bold text-muted-foreground mb-1">{stat.label}</span>
                            <span className={cn("text-sm font-mono font-bold px-2 py-0.5 rounded", stat.color, "text-white")}>{stat.value}</span>
                          </div>
                        ))}
                      </div>
                      {/* Desktop: Full bars layout */}
                      <div className="hidden lg:block space-y-3">
                      <p className="text-xs font-bold uppercase text-center mb-4 text-muted-foreground">Base Stats</p>
                      <div className="space-y-3">
                        {[
                          { label: 'HP', value: selectedPokemon.hp, color: 'bg-green-500' },
                          { label: 'ATK', value: selectedPokemon.attack, color: 'bg-red-500' },
                          { label: 'DEF', value: selectedPokemon.defense, color: 'bg-yellow-500' },
                          { label: 'SP.A', value: selectedPokemon.specialAttack, color: 'bg-blue-500' },
                          { label: 'SP.D', value: selectedPokemon.specialDefense, color: 'bg-purple-500' },
                          { label: 'SPD', value: selectedPokemon.speed, color: 'bg-pink-500' }
                        ].map(stat => (
                          <div key={stat.label} className="flex items-center gap-2">
                            <span className="text-sm font-mono font-bold w-12 text-right">{stat.label}</span>
                            <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden border border-border">
                              <div 
                                className={cn("h-full transition-all duration-500", stat.color)}
                                style={{ width: `${Math.min(100, (stat.value / 255) * 100)}%` }}
                              />
                            </div>
                            <span className="text-sm font-mono font-bold w-12">{stat.value}</span>
                          </div>
                        ))}
                      </div>
                      {/* Total - shown on both mobile and desktop */}
                      <div className="pt-2 border-t border-border mt-2 lg:mt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs lg:text-sm font-mono font-bold">TOTAL</span>
                          <span className="text-sm lg:text-base font-mono font-bold text-primary">
                            {selectedPokemon.hp + selectedPokemon.attack + selectedPokemon.defense + 
                             selectedPokemon.specialAttack + selectedPokemon.specialDefense + selectedPokemon.speed}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="w-full space-y-2 mb-3">
                    <p className="text-xs font-bold uppercase text-muted-foreground text-center">Select Generation</p>
                    <div className="grid grid-cols-3 gap-1.5 lg:gap-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(gen => (
                        <button
                          key={gen}
                          onClick={() => setSelectedGen(gen)}
                          className={cn(
                            "py-1.5 lg:py-2 px-1 lg:px-2 rounded font-retro text-[10px] lg:text-xs border-2 transition-colors",
                            selectedGen === gen 
                              ? "bg-primary border-primary text-white" 
                              : "bg-white border-border text-foreground hover:border-primary"
                          )}
                        >
                          GEN {gen}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="w-full bg-accent/10 p-2 lg:p-3 rounded-lg border-2 border-accent/20">
                    <p className="text-xs font-bold uppercase mb-2 text-accent-foreground">Search Moves</p>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input 
                        placeholder="Quick find..."
                        className="w-full pl-8 pr-2 py-2 rounded border-2 border-border focus:outline-none focus:border-primary text-xs lg:text-sm font-mono"
                        value={pokemonMoveSearch}
                        onChange={(e) => setPokemonMoveSearch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-[300px] lg:min-h-0">
                  <div className="mb-4">
                    <h3 className="text-base lg:text-lg font-retro tracking-tighter mb-3">LEARNSET (GEN {selectedGen})</h3>
                  </div>
                  
                  {isLoadingMoves ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                  ) : !moves || moves.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-muted-foreground font-mono text-sm">No moves found for this generation.</p>
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono italic">Note: Some alternate forms share base movesets.</p>
                    </div>
                  ) : filteredMoves.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-muted-foreground font-mono text-sm">No moves match "{pokemonMoveSearch}"</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {filteredMoves.map((move: any, i: number) => (
                        <div 
                          key={`${move.id}-${i}`} 
                          className="move-card-container"
                          data-move-name={move.name.toLowerCase().replace(/-/g, ' ')}
                        >
                          <MoveCard index={i} {...move} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
    </Layout>
  );
}
