import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface MoveCardProps {
  name: string;
  type: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  index: number;
  description?: string | null;
}

export function MoveCard({ name, type, power, accuracy, pp, index, description }: MoveCardProps) {
  // Normalize type for CSS class
  const typeClass = `type-${type.toLowerCase()}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={cn(
        "relative overflow-hidden rounded-lg p-4 pixel-border-sm hover:scale-[1.02] transition-transform group",
        "flex flex-col justify-between min-h-[140px]",
        type.toLowerCase() === "normal" ? "bg-[#A8A77A]" :
        type.toLowerCase() === "fire" ? "bg-[#EE8130]" :
        type.toLowerCase() === "water" ? "bg-[#6390F0]" :
        type.toLowerCase() === "electric" ? "bg-[#F7D02C]" :
        type.toLowerCase() === "grass" ? "bg-[#7AC74C]" :
        type.toLowerCase() === "ice" ? "bg-[#96D9D6]" :
        type.toLowerCase() === "fighting" ? "bg-[#C22E28]" :
        type.toLowerCase() === "poison" ? "bg-[#A33EA1]" :
        type.toLowerCase() === "ground" ? "bg-[#E2BF65]" :
        type.toLowerCase() === "flying" ? "bg-[#A98FF3]" :
        type.toLowerCase() === "psychic" ? "bg-[#F95587]" :
        type.toLowerCase() === "bug" ? "bg-[#A6B91A]" :
        type.toLowerCase() === "rock" ? "bg-[#B6A136]" :
        type.toLowerCase() === "ghost" ? "bg-[#735797]" :
        type.toLowerCase() === "dragon" ? "bg-[#6F35FC]" :
        type.toLowerCase() === "dark" ? "bg-[#705746]" :
        type.toLowerCase() === "steel" ? "bg-[#B7B7CE]" :
        type.toLowerCase() === "fairy" ? "bg-[#D685AD]" : "bg-white"
      )}
    >
      <div className={cn(
        "absolute top-0 right-0 px-3 py-1 text-xs font-bold uppercase rounded-bl-lg border-l-2 border-b-2 border-black/10 bg-black/20 text-white z-10"
      )}>
        {type}
      </div>

      <div className="relative z-10">
        <h3 className="font-retro text-white text-lg drop-shadow-md mb-1 uppercase tracking-tighter truncate pr-16">
          {name.replace(/-/g, " ")}
        </h3>
        {description && (
          <p className="text-[10px] text-white/90 leading-tight font-pixel line-clamp-2 italic mb-2">
            {description}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-auto text-base font-mono bg-black/20 p-3 rounded text-white relative z-10">
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-wider opacity-80 font-bold">Power</span>
          <span className="font-bold text-lg">{power || "-"}</span>
        </div>
        <div className="flex flex-col items-center border-l border-white/10">
          <span className="text-xs uppercase tracking-wider opacity-80 font-bold">PP</span>
          <span className="font-bold text-lg">{pp || "-"}</span>
        </div>
        <div className="flex flex-col items-center border-l border-white/10">
          <span className="text-xs uppercase tracking-wider opacity-80 font-bold">Acc</span>
          <span className="font-bold text-lg">{accuracy ? `${accuracy}%` : "-"}</span>
        </div>
      </div>
    </motion.div>
  );
}
