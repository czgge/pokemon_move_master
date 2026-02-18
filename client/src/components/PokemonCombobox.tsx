import * as React from "react";
import { Check, Search, Loader2 } from "lucide-react";
import { Command as CommandPrimitive } from "cmdk";
import { useSearchPokemon } from "@/hooks/use-game";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce"; // We'll need to create this hook or implement inline

// Basic Command components styled for shadcn/ui + retro theme
const Command = React.forwardRef<React.ElementRef<typeof CommandPrimitive>, React.ComponentPropsWithoutRef<typeof CommandPrimitive>>(({ className, ...props }, ref) => (
  <CommandPrimitive ref={ref} className={cn("flex h-full w-full flex-col overflow-hidden rounded-md bg-white text-popover-foreground pixel-border-sm", className)} {...props} />
));
Command.displayName = CommandPrimitive.displayName;

const CommandInput = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Input>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input ref={ref} className={cn("flex h-12 w-full rounded-md bg-transparent py-3 text-lg outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 font-retro", className)} {...props} />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<React.ElementRef<typeof CommandPrimitive.List>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>>(({ className, ...props }, ref) => (
  <CommandPrimitive.List ref={ref} className={cn("max-h-[300px] overflow-y-auto overflow-x-hidden p-2", className)} {...props} />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Empty>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>>((props, ref) => (
  <CommandPrimitive.Empty ref={ref} className="py-6 text-center text-sm" {...props} />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandItem = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Item>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item ref={ref} className={cn("relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-lg outline-none data-[selected='true']:bg-accent data-[selected='true']:text-accent-foreground font-retro hover:bg-accent/50", className)} {...props} />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

interface PokemonComboboxProps {
  onSelect: (pokemonId: number, name: string) => void;
  maxGen: number;
  disabled?: boolean;
}

export function PokemonCombobox({ onSelect, maxGen, disabled }: PokemonComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebounce(query, 300); // Wait 300ms before searching
  
  const { data: pokemonList, isLoading } = useSearchPokemon(debouncedQuery, maxGen.toString());

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <Command shouldFilter={false} className="overflow-visible z-50">
        <CommandInput 
          placeholder="Type Pokémon name..." 
          value={query}
          onValueChange={setQuery}
          disabled={disabled}
          onFocus={() => setOpen(true)}
        />
        
        {open && query.length > 0 && (
          <div className="absolute top-full mt-2 w-full bg-white z-50 rounded-md pixel-border shadow-xl">
            <CommandList>
              {isLoading && (
                <div className="py-6 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
              
              {!isLoading && pokemonList?.length === 0 && (
                <CommandEmpty>No Pokémon found.</CommandEmpty>
              )}
              
              {!isLoading && pokemonList?.map((pokemon) => (
                <CommandItem
                  key={pokemon.id}
                  value={pokemon.name}
                  onSelect={() => {
                    onSelect(pokemon.id, pokemon.name);
                    setQuery(pokemon.name.replace(/-default.*/, "").replace(/-/g, " "));
                    setOpen(false);
                  }}
                  onPointerDown={(e) => {
                    // Force selection on click/tap for cmdk in some environments
                    onSelect(pokemon.id, pokemon.name);
                    setQuery(pokemon.name.replace(/-default.*/, "").replace(/-/g, " "));
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center gap-3 w-full">
                     {pokemon.imageUrl ? (
                        <img 
                          src={pokemon.imageUrl} 
                          alt={pokemon.name} 
                          className="w-10 h-10 object-contain pixelated" 
                        />
                     ) : (
                        <div className="w-10 h-10 bg-muted rounded-full" />
                     )}
                     <div className="flex flex-col">
                       <span className="capitalize">{pokemon.name.replace(/-default.*/, "")}</span>
                       <span className="text-xs text-muted-foreground flex gap-1">
                         <span className={cn("px-1 rounded text-[10px] text-white", `type-${pokemon.type1.toLowerCase()}`)}>{pokemon.type1}</span>
                         {pokemon.type2 && <span className={cn("px-1 rounded text-[10px] text-white", `type-${pokemon.type2.toLowerCase()}`)}>{pokemon.type2}</span>}
                       </span>
                     </div>
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </div>
        )}
      </Command>
    </div>
  );
}
