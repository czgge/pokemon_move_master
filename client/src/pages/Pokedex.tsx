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

  const { data: moveSuggestions } = useQuery({
    queryKey: ["/api/moves/search", debouncedMoveSearch, maxGen],
    queryFn: async () => {
      if (!debouncedMoveSearch || debouncedMoveSearch.length < 2) return [];
      const res = await fetch(`/api/moves/search?query=${debouncedMoveSearch}&gen=${maxGen}`);
      return await res.json();
    },
    enabled: debouncedMoveSearch.length >= 2
  });

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
    return name.replace(/-default.*/, "").replace(/-/g, " ");
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

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
            <h1 className="text-3xl md:text-4xl font-retro text-foreground tracking-tighter uppercase">POKÉDEX</h1>
            
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                placeholder="Search Pokémon..."
                className="w-full pl-10 pr-4 py-2 rounded border-2 border-border focus:border-primary focus:outline-none font-mono text-sm"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </div>

          <div className="bg-muted/30 p-4 rounded-lg pixel-border-sm flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="font-retro text-[10px] uppercase whitespace-nowrap">Max Gen:</span>
                <select 
                  className="bg-white border-2 border-border rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-primary h-8"
                  value={maxGen}
                  onChange={(e) => { setMaxGen(parseInt(e.target.value)); setPage(1); }}
                >
                  {[1,2,3,4,5,6,7,8,9].map(g => <option key={g} value={g}>Gen {g}</option>)}
                </select>
              </div>

              <div className="flex-1 w-full relative">
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input 
                    placeholder="Filter by move combination (max 4)..."
                    className="w-full pl-8 pr-4 py-1.5 rounded border-2 border-border focus:border-primary focus:outline-none font-mono text-xs h-8"
                    value={moveSearch}
                    onChange={(e) => {
                      setMoveSearch(e.target.value);
                      setShowMoveSuggestions(true);
                    }}
                    onFocus={() => setShowMoveSuggestions(true)}
                  />
                </div>
                
                <AnimatePresence>
                  {showMoveSuggestions && moveSuggestions && moveSuggestions.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute left-0 right-0 top-full mt-1 bg-white border-2 border-border rounded-lg shadow-lg z-50 overflow-hidden"
                    >
                      {moveSuggestions.map((move: any) => (
                        <button
                          key={move.id}
                          className="w-full text-left px-4 py-2 hover:bg-primary/10 transition-colors font-mono text-xs border-b last:border-0 border-border flex items-center justify-between group"
                          onClick={() => addMoveFilter(move.name)}
                        >
                          <span className="capitalize">{move.name.replace(/-/g, ' ')}</span>
                          <span className={cn("text-[8px] px-1.5 py-0.5 rounded text-white uppercase font-bold", `type-${move.type.toLowerCase()}`)}>
                            {move.type}
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {moveFilters.length > 0 && (
              <div className="flex flex-wrap gap-2">
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
                    <span className={`text-[8px] px-1.5 py-0.5 rounded text-white uppercase font-bold type-${pokemon.type1.toLowerCase()}`}>
                      {pokemon.type1}
                    </span>
                    {pokemon.type2 && (
                      <span className={`text-[8px] px-1.5 py-0.5 rounded text-white uppercase font-bold type-${pokemon.type2.toLowerCase()}`}>
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
      </div>

      <AnimatePresence>
        {selectedPokemon && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedPokemon(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white rounded-lg pixel-border p-6 flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setSelectedPokemon(null)}
                className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full transition-colors z-20"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="flex flex-col md:flex-row gap-8 mb-6 overflow-hidden flex-1">
                <div className="w-full md:w-1/4 flex flex-col items-center shrink-0">
                  <div className="w-40 h-40 bg-muted/30 rounded-lg p-4 mb-4 flex items-center justify-center">
                    <img 
                      src={selectedPokemon.imageUrl} 
                      alt={selectedPokemon.name} 
                      className="w-full h-full object-contain pixelated"
                    />
                  </div>
                  <h2 className="text-xl font-retro text-center mb-2 tracking-tighter uppercase">{formatName(selectedPokemon.name)}</h2>
                  <div className="flex justify-center gap-2 mb-6">
                    <span className={`px-2 py-0.5 rounded text-[10px] text-white font-bold type-${selectedPokemon.type1.toLowerCase()}`}>
                      {selectedPokemon.type1}
                    </span>
                    {selectedPokemon.type2 && (
                      <span className={`px-2 py-0.5 rounded text-[10px] text-white font-bold type-${selectedPokemon.type2.toLowerCase()}`}>
                        {selectedPokemon.type2}
                      </span>
                    )}
                  </div>
                  
                  <div className="w-full space-y-2 mb-4">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground text-center">Select Generation</p>
                    <div className="grid grid-cols-3 gap-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(gen => (
                        <button
                          key={gen}
                          onClick={() => setSelectedGen(gen)}
                          className={cn(
                            "py-1 px-1 rounded font-retro text-[8px] border-2 transition-colors",
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

                  <div className="w-full bg-accent/10 p-3 rounded-lg border-2 border-accent/20">
                    <p className="text-[10px] font-bold uppercase mb-2 text-accent-foreground">Search Moves</p>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <input 
                        placeholder="Quick find..."
                        className="w-full pl-7 pr-2 py-1 rounded border-2 border-border focus:outline-none focus:border-primary text-xs font-mono"
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase().trim();
                          const elements = document.querySelectorAll('.move-card-container');
                          elements.forEach((el: any) => {
                            const name = el.getAttribute('data-move-name') || "";
                            if (!val) {
                              el.style.display = 'block';
                            } else {
                              el.style.display = name.includes(val) ? 'block' : 'none';
                            }
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <h3 className="text-lg font-retro mb-4 sticky top-0 bg-white py-2 z-10 tracking-tighter">LEARNSET (GEN {selectedGen})</h3>
                  {isLoadingMoves ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                  ) : !moves || moves.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-muted-foreground font-mono text-sm">No moves found for this generation.</p>
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono italic">Note: Some alternate forms share base movesets.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {moves.map((move: any, i: number) => (
                        <div key={`${move.id}-${i}`} className="move-card-container" data-move-name={move.name.toLowerCase().replace(/-/g, ' ')}>
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
