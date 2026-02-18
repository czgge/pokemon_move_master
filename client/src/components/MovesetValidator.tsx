import { useState, useRef, useEffect } from "react";
import { RetroButton } from "./RetroButton";
import { RetroCard } from "./RetroCard";
import { Loader2, X, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

interface MovesetValidatorProps {
  maxGen: number;
  onGenChange: (gen: number) => void;
}

export function MovesetValidator({ maxGen, onGenChange }: MovesetValidatorProps) {
  const [selectedMoves, setSelectedMoves] = useState<string[]>([]);
  const [validationResult, setValidationResult] = useState<{ 
    isUnique: boolean; 
    pokemonList: string[];
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [moveSearch, setMoveSearch] = useState("");
  const [debouncedMoveSearch, setDebouncedMoveSearch] = useState("");
  const [showMoveSuggestions, setShowMoveSuggestions] = useState(false);
  const moveSearchRef = useRef<HTMLDivElement>(null);

  // Debounce move search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMoveSearch(moveSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [moveSearch]);

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

  const { data: moveSuggestions } = useQuery({
    queryKey: ["/api/moves/search", debouncedMoveSearch, maxGen],
    queryFn: async () => {
      if (!debouncedMoveSearch || debouncedMoveSearch.length < 2) return [];
      const res = await fetch(`/api/moves/search?query=${debouncedMoveSearch}&gen=${maxGen}`);
      if (!res.ok) return [];
      return await res.json();
    },
    enabled: debouncedMoveSearch.length >= 2
  });

  const formatName = (name: string) => {
    return name.replace(/-default.*/, "").replace(/-/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  const addMove = (moveName: string) => {
    const formatted = moveName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!selectedMoves.includes(formatted) && selectedMoves.length < 4) {
      setSelectedMoves([...selectedMoves, formatted]);
      setValidationResult(null);
    }
    setMoveSearch("");
    setShowMoveSuggestions(false);
  };

  const removeMove = (move: string) => {
    setSelectedMoves(selectedMoves.filter(m => m !== move));
    setValidationResult(null);
  };

  const validateMoveset = async () => {
    if (selectedMoves.length === 0) return;
    
    setIsValidating(true);
    setValidationResult(null);
    
    try {
      const res = await fetch('/api/game/check-moveset-owners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moves: selectedMoves,
          gen: maxGen
        })
      });
      
      if (!res.ok) throw new Error('Validation failed');
      
      const result = await res.json();
      setValidationResult({
        isUnique: result.pokemon.length === 1,
        pokemonList: result.pokemon
      });
    } catch (error) {
      console.error('Validation error:', error);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <RetroCard className="p-6">
        <h2 className="text-2xl font-retro text-primary mb-6 uppercase">Moveset Validator</h2>
        
        <div className="space-y-6">
          {/* Generation Selector */}
          <div>
            <label className="block text-base font-bold uppercase mb-3">Select Generation</label>
            <select 
              className="w-full bg-white border-2 border-border rounded px-4 py-3 text-base font-mono focus:outline-none focus:border-primary"
              value={maxGen}
              onChange={(e) => onGenChange(parseInt(e.target.value))}
            >
              {[1,2,3,4,5,6,7,8,9].map(g => <option key={g} value={g}>Generation {g}</option>)}
            </select>
          </div>

          {/* Move Search with Suggestions */}
          <div>
            <label className="block text-base font-bold uppercase mb-3">
              Add Moves ({selectedMoves.length}/4)
            </label>
            <div className="relative" ref={moveSearchRef}>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    value={moveSearch}
                    onChange={(e) => {
                      setMoveSearch(e.target.value);
                      setShowMoveSuggestions(true);
                    }}
                    onFocus={() => setShowMoveSuggestions(true)}
                    placeholder="Type move name..."
                    disabled={selectedMoves.length >= 4}
                    className="w-full pl-10 pr-4 py-3 text-base rounded border-2 border-border focus:border-primary focus:outline-none font-mono"
                  />
                </div>
              </div>
              
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
                        className="w-full text-left px-4 py-3 hover:bg-primary/10 transition-colors font-mono text-sm border-b last:border-0 border-border flex items-center justify-between group"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          addMove(move.name);
                        }}
                      >
                        <span className="capitalize text-base">{move.name.replace(/-/g, ' ')}</span>
                        <span className={cn("text-xs px-2 py-1 rounded uppercase font-bold", `type-${move.type.toLowerCase()}`)}>
                          {move.type}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <p className="text-sm text-muted-foreground mt-2 italic">
              Start typing to search for moves in Generation {maxGen}
            </p>
          </div>

          {/* Selected Moves */}
          {selectedMoves.length > 0 && (
            <div>
              <label className="block text-base font-bold uppercase mb-3">Selected Moves</label>
              <div className="flex flex-wrap gap-3">
                {selectedMoves.map(move => (
                  <span key={move} className="bg-primary text-white px-4 py-2 rounded-full text-base font-bold uppercase flex items-center gap-2">
                    {move.replace(/-/g, " ")}
                    <button onClick={() => removeMove(move)} className="hover:text-red-200">
                      <X className="w-5 h-5" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Validate Button */}
          <div className="flex gap-3">
            <RetroButton 
              onClick={validateMoveset}
              disabled={selectedMoves.length === 0 || isValidating}
              className="flex-1 text-lg py-4"
            >
              {isValidating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              Check Uniqueness
            </RetroButton>
            {selectedMoves.length > 0 && (
              <RetroButton 
                variant="outline"
                onClick={() => { setSelectedMoves([]); setValidationResult(null); }}
                className="text-lg py-4"
              >
                Clear All
              </RetroButton>
            )}
          </div>

          {/* Validation Result */}
          {validationResult && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "p-5 rounded-lg border-2",
                validationResult.isUnique 
                  ? "bg-green-100 text-green-800 border-green-400" 
                  : "bg-blue-100 text-blue-800 border-blue-400"
              )}
            >
              {validationResult.pokemonList.length === 0 ? (
                <p className="text-base font-mono font-bold">
                  ✗ No Pokémon can learn this combination of moves in Generation {maxGen}
                </p>
              ) : validationResult.isUnique ? (
                <div>
                  <p className="text-lg font-mono font-bold mb-2">
                    ✓ This moveset is UNIQUE!
                  </p>
                  <p className="text-base font-mono">
                    Only <span className="font-bold">{formatName(validationResult.pokemonList[0])}</span> can learn this combination
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-mono font-bold mb-3">
                    ✗ This moveset is NOT unique
                  </p>
                  <p className="text-sm font-mono mb-2">
                    {validationResult.pokemonList.length} Pokémon can learn this combination:
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {validationResult.pokemonList.map((name, i) => (
                      <span key={i} className="bg-blue-200 text-blue-900 px-3 py-1 rounded-full text-sm font-bold">
                        {formatName(name)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </RetroCard>

      <div className="text-center text-sm text-muted-foreground italic">
        Enter up to 4 moves to see which Pokémon can learn that combination
      </div>
    </div>
  );
}
