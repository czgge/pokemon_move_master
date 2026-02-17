import { Heart, Trophy } from "lucide-react";

interface GameHeaderProps {
  lives: number;
  score: number;
  maxLives?: number;
}

export function GameHeader({ lives, score, maxLives = 3 }: GameHeaderProps) {
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
      
      <div className="flex items-center gap-2">
        <Trophy className="w-6 h-6 text-yellow-500" />
        <span className="text-xl md:text-2xl font-bold font-retro text-primary">{score} PTS</span>
      </div>
    </div>
  );
}
