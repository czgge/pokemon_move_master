import { useState } from "react";
import { Layout } from "@/components/Layout";
import { RetroCard } from "@/components/RetroCard";
import { usePokemonList } from "@/hooks/use-game";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PokemonSprite } from "@/components/PokemonSprite";
import { Search, Loader2 } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce"; // We need to create this simple hook or use lodash
import { Pokemon } from "@shared/schema";

export default function Pokedex() {
  const [search, setSearch] = useState("");
  const [genFilter, setGenFilter] = useState<string>("all");
  
  // Custom debounce would be ideal, but for now we pass directly (React Query handles deduping)
  const { data, isLoading } = usePokemonList({ 
    search: search || undefined, 
    maxGen: genFilter !== "all" ? genFilter : undefined 
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="space-y-1">
            <h1 className="font-retro text-2xl">Pokedex</h1>
            <p className="font-pixel text-lg text-muted-foreground">National Dex Database</p>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                className="pl-9 bg-white border-2 font-pixel text-lg h-10"
                placeholder="Search Pokemon..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <Select value={genFilter} onValueChange={setGenFilter}>
              <SelectTrigger className="w-[140px] bg-white border-2 h-10 font-retro text-xs">
                <SelectValue placeholder="Gen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Gens</SelectItem>
                <SelectItem value="1">Gen 1</SelectItem>
                <SelectItem value="2">Gen 2</SelectItem>
                <SelectItem value="3">Gen 3</SelectItem>
                <SelectItem value="4">Gen 4</SelectItem>
                <SelectItem value="5">Gen 5</SelectItem>
                <SelectItem value="6">Gen 6</SelectItem>
                <SelectItem value="7">Gen 7</SelectItem>
                <SelectItem value="8">Gen 8</SelectItem>
                <SelectItem value="9">Gen 9</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {isLoading ? (
            <div className="col-span-full h-64 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : data?.items.length === 0 ? (
            <div className="col-span-full h-64 flex items-center justify-center font-pixel text-xl text-muted-foreground">
              No Pokemon found...
            </div>
          ) : (
            data?.items.map((pkmn: Pokemon) => (
              <RetroCard key={pkmn.id} className="p-3 hover:border-primary transition-colors cursor-pointer group">
                <div className="absolute top-2 right-2 font-pixel text-xs text-muted-foreground">
                  #{String(pkmn.id).padStart(3, '0')}
                </div>
                
                <div className="h-24 flex items-center justify-center my-2">
                  <PokemonSprite 
                    src={pkmn.imageUrl} 
                    alt={pkmn.name} 
                    className="group-hover:scale-110 transition-transform duration-200" 
                  />
                </div>
                
                <div className="space-y-1">
                  <h3 className="font-retro text-[10px] uppercase truncate text-center leading-tight">
                    {pkmn.name}
                  </h3>
                  <div className="flex justify-center gap-1">
                    <TypeBadge type={pkmn.type1} />
                    {pkmn.type2 && <TypeBadge type={pkmn.type2} />}
                  </div>
                </div>
              </RetroCard>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    normal: "bg-neutral-400 text-white",
    fire: "bg-orange-500 text-white",
    water: "bg-blue-500 text-white",
    grass: "bg-green-500 text-white",
    electric: "bg-yellow-400 text-yellow-900",
    ice: "bg-cyan-300 text-cyan-900",
    fighting: "bg-red-700 text-white",
    poison: "bg-purple-500 text-white",
    ground: "bg-amber-600 text-white",
    flying: "bg-indigo-300 text-indigo-900",
    psychic: "bg-pink-500 text-white",
    bug: "bg-lime-500 text-lime-900",
    rock: "bg-stone-500 text-white",
    ghost: "bg-purple-800 text-white",
    dragon: "bg-indigo-600 text-white",
    steel: "bg-slate-400 text-slate-900",
    dark: "bg-neutral-800 text-white",
    fairy: "bg-pink-300 text-pink-900",
  };

  return (
    <span className={cn(
      "px-1.5 py-0.5 rounded-[2px] text-[8px] uppercase font-bold tracking-wider",
      colors[type.toLowerCase()] || "bg-gray-400"
    )}>
      {type}
    </span>
  );
}
