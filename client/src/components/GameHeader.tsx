import { Heart, Trophy, RotateCcw } from "lucide-react";

interface GameHeaderProps {
  lives: number;
  score: number;
  maxLives?: number;
  difficulty?: string;
  onReset?: () => void;
}

export function GameHeader({ lives, score, maxLives = 3, difficulty, onReset }: GameHeaderProps) {
  // Show only filled hearts (not empty ones)
  return (
    <div className="flex items-center justify-between w-full p-4 bg-card/80 backdrop-blur pixel-border-sm mb-6 sticky top-2 z-40">
      <div className="flex items-center gap-3">
        {/* Lives - only show filled hearts */}
        <div className="flex items-center gap-1">
          {Array.from({ length: lives }).map((_, i) => (
            <Heart 
              key={i} 
              className="w-6 h-6 md:w-8 md:h-8 fill-red-500 text-red-600 transition-all duration-300" 
            />
          ))}
        </div>
        
        {/* Difficulty Badge */}
        {difficulty && (
          <div className={`px-2 py-1 text-xs font-bold uppercase rounded border-2 ${
            difficulty === 'easy' ? 'bg-green-100 text-green-700 border-green-300' :
            difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
            'bg-red-100 text-red-700 border-red-300'
          }`}>
            {difficulty}
          </div>
        )}
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
