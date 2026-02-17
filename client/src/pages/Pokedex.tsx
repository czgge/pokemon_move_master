import { useState } from "react";
import { Layout } from "@/components/Layout";
import { RetroCard } from "@/components/RetroCard";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Loader2, Search } from "lucide-react";
import { RetroButton } from "@/components/RetroButton";
import { useDebounce } from "@/hooks/use-debounce";

export default function Pokedex() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  
  // Use raw fetch or hook for list. Re-using useSearchPokemon isn't quite right because that's for autocomplete.
  // We need the paginated list endpoint.
  const { data, isLoading } = useQuery({
    queryKey: [api.pokedex.list.path, debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append("search", debouncedSearch);
      params.append("page", page.toString());
      
      const res = await fetch(`${api.pokedex.list.path}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed");
      return api.pokedex.list.responses[200].parse(await res.json());
    }
  });

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-8">
          <h1 className="text-3xl md:text-4xl font-retro text-foreground">POKÉDEX</h1>
          
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              placeholder="Search Pokémon..."
              className="w-full pl-10 pr-4 py-2 rounded border-2 border-border focus:border-primary focus:outline-none font-mono"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {data?.items.map((pokemon) => (
                <RetroCard key={pokemon.id} className="group hover:border-primary transition-colors cursor-default">
                  <div className="relative aspect-square bg-muted/30 rounded-lg mb-3 flex items-center justify-center p-4">
                    <span className="absolute top-2 left-2 text-xs font-mono text-muted-foreground">#{pokemon.id}</span>
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
                  
                  <h3 className="font-bold text-center capitalize mb-2 truncate px-1">
                    {pokemon.name.replace(/-.*/, "")}
                  </h3>
                  
                  <div className="flex justify-center gap-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded text-white uppercase font-bold type-${pokemon.type1.toLowerCase()}`}>
                      {pokemon.type1}
                    </span>
                    {pokemon.type2 && (
                      <span className={`text-[10px] px-2 py-0.5 rounded text-white uppercase font-bold type-${pokemon.type2.toLowerCase()}`}>
                        {pokemon.type2}
                      </span>
                    )}
                  </div>
                </RetroCard>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex justify-center gap-4 mt-8">
              <RetroButton 
                variant="outline" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </RetroButton>
              <span className="flex items-center font-mono">Page {page}</span>
              <RetroButton 
                variant="outline" 
                onClick={() => setPage(p => p + 1)}
                disabled={!data || data.items.length < 20}
              >
                Next
              </RetroButton>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
