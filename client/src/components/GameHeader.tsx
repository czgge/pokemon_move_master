import { Heart, Trophy, RotateCcw } from "lucide-react";

interface GameHeaderProps {
  lives: number;
  score: number;
  maxLives?: number;
  onReset?: () => void;
}

export function GameHeader({ lives, score, maxLives = 3, onReset }: GameHeaderProps) {
  return (
    <div className="flex items-center justify-between w-full p-4 bg-white/80 backdrop-blur pixel-border-sm mb-6 sticky top-2 z-40">
      <div className="flex items-center gap-1">
        {Array.from({ length: maxLives }).map((_, i) => (
          <Heart 
            key={i} 
            className={`w-6 h-6 md:w-8 md:h-8 transition-colors duration-300 ${i < lives ? "fill-red-500 text-red-600" : "fill-gray-200 text-gray-300"}`} 
          />
        ))}
      </div>
      
      <div className="flex items-center gap-3">
        {onReset && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-3 py-1 text-xs font-bold uppercase bg-muted hover:bg-muted/80 border-2 border-border rounded transition-colors"
            title="Restart Game"
          >
            <RotateCcw className="w-3 h-3" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        )}
        <div className="flex items-center gap-2">
          <Trophy className="w-6 h-6 text-yellow-500" />
          <span className="text-xl md:text-2xl font-bold font-retro text-primary">{score} PTS</span>
        </div>
      </div>
    </div>
  );
}
