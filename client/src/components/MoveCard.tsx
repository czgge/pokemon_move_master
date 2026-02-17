import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface MoveCardProps {
  name: string;
  type: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  index: number;
}

export function MoveCard({ name, type, power, accuracy, pp, index }: MoveCardProps) {
  // Normalize type for CSS class
  const typeClass = `type-${type.toLowerCase()}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={cn(
        "relative overflow-hidden rounded-lg p-4 pixel-border-sm bg-white hover:scale-[1.02] transition-transform",
        "flex flex-col justify-between min-h-[140px]"
      )}
    >
      <div className={cn(
        "absolute top-0 right-0 px-3 py-1 text-xs font-bold uppercase rounded-bl-lg border-l-2 border-b-2 border-black/10",
        typeClass
      )}>
        {type}
      </div>

      <h3 className="text-xl md:text-2xl font-bold mt-4 mb-2 capitalize leading-tight">
        {name.replace(/-/g, " ")}
      </h3>

      <div className="grid grid-cols-3 gap-2 mt-auto text-sm text-muted-foreground font-mono bg-muted/30 p-2 rounded">
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-wider opacity-70">Power</span>
          <span className="font-bold text-foreground">{power || "-"}</span>
        </div>
        <div className="flex flex-col items-center border-l border-foreground/10">
          <span className="text-[10px] uppercase tracking-wider opacity-70">PP</span>
          <span className="font-bold text-foreground">{pp || "-"}</span>
        </div>
        <div className="flex flex-col items-center border-l border-foreground/10">
          <span className="text-[10px] uppercase tracking-wider opacity-70">Acc</span>
          <span className="font-bold text-foreground">{accuracy ? `${accuracy}%` : "-"}</span>
        </div>
      </div>
    </motion.div>
  );
}
