import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { RetroButton } from "@/components/RetroButton";
import { RetroCard } from "@/components/RetroCard";
import { useSubmitGuess, useGetHint } from "@/hooks/use-game";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Zap, Map, HelpCircle, Check, X, ArrowRight } from "lucide-react";
import confetti from "canvas-confetti";
import { PokemonSprite } from "@/components/PokemonSprite";
import { cn } from "@/lib/utils";

// Types derived from API response
interface GameRoundData {
  roundToken: string;
  moves: string[];
  generation: number;
  options: { id: number; name: string; imageUrl?: string | null }[];
}

export default function GamePlay() {
  const [_, setLocation] = useLocation();
  const [gameData, setGameData] = useState<GameRoundData | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [attempts, setAttempts] = useState(1);
  const [hintsUsed, setHintsUsed] = useState(0);
  
  // Feedback state
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [revealedPokemon, setRevealedPokemon] = useState<any>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Hooks
  const submitGuess = useSubmitGuess();
  const getHint = useGetHint();

  useEffect(() => {
    // Load initial game data
    const savedData = sessionStorage.getItem("currentGame");
    if (!savedData) {
      setLocation("/game/setup");
      return;
    }
    setGameData(JSON.parse(savedData));
  }, [setLocation]);

  const handleGuess = async (pokemonId: number) => {
    if (!gameData || isProcessing || feedback === "correct") return;
    
    setIsProcessing(true);
    
    try {
      const result = await submitGuess.mutateAsync({
        roundToken: gameData.roundToken,
        guessedPokemonId: pokemonId,
        attempt: attempts,
        hintsUsed,
      });

      if (result.correct) {
        setFeedback("correct");
        setScore((prev) => prev + result.points);
        setRevealedPokemon(result.correctPokemon);
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      } else {
        setFeedback("wrong");
        setLives(result.livesRemaining);
        
        if (result.livesRemaining <= 0) {
          // Game Over logic would go here
          setRevealedPokemon(result.correctPokemon); // Reveal the answer
        } else if (attempts >= 3) {
          // Round failed but game continues (if we implemented per-round lives, but API suggests global lives)
          // For this logic, let's assume if attempts reaches 3, they lose the round
           setRevealedPokemon(result.correctPokemon);
        } else {
           setAttempts(prev => prev + 1);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleHint = async (type: 'generation' | 'type') => {
    if (!gameData || hintText) return;
    try {
      const res = await getHint.mutateAsync({ 
        roundToken: gameData.roundToken, 
        type 
      });
      setHintText(res.hint);
      setHintsUsed(prev => prev + 1);
    } catch (e) {
      console.error(e);
    }
  };

  const nextRound = () => {
    // In a real app, we'd fetch the next round from the server here
    // For this MVP, we'll redirect to setup to "restart" or simulate fetching new round
    // A proper implementation would have a /api/game/next endpoint
    setLocation("/game/setup"); 
  };

  if (!gameData) return null;

  const isGameOver = lives <= 0;
  const showReveal = feedback === "correct" || isGameOver || (feedback === "wrong" && attempts >= 3);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Game Status & Moves */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Status Bar */}
          <div className="flex items-center justify-between bg-white p-4 rounded-lg border-b-4 border-foreground/10">
            <div className="flex items-center gap-2">
              <span className="font-retro text-xs text-muted-foreground uppercase">LIVES</span>
              <div className="flex gap-1">
                {[1, 2, 3].map((i) => (
                  <Heart 
                    key={i} 
                    className={cn("w-6 h-6 fill-current transition-colors", i <= lives ? "text-red-500" : "text-gray-200")} 
                  />
                ))}
              </div>
            </div>
            
            <div className="text-center">
              <span className="font-retro text-2xl font-bold">{score}</span>
              <span className="block font-pixel text-sm text-muted-foreground">POINTS</span>
            </div>
            
            <div className="text-right">
              <span className="font-retro text-xs text-muted-foreground uppercase block">ATTEMPT</span>
              <span className="font-retro text-lg text-primary">{attempts}/3</span>
            </div>
          </div>

          {/* Moves Display - Styled like Gameboy Screen */}
          <RetroCard variant="screen" className="py-8 min-h-[300px] flex flex-col items-center justify-center gap-6">
            <h2 className="font-retro text-sm text-[#0f380f] opacity-70 uppercase tracking-widest mb-2">Known Moveset</h2>
            <div className="grid grid-cols-2 gap-4 w-full max-w-lg px-4">
              {gameData.moves.map((move, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-[#8bac0f] border-2 border-[#306230] p-4 text-center rounded shadow-sm"
                >
                  <span className="font-retro text-xs md:text-sm text-[#0f380f] font-bold uppercase">{move}</span>
                </motion.div>
              ))}
            </div>

            {/* Hint Display */}
            <AnimatePresence>
              {hintText && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 bg-[#306230] text-[#9bbc0f] px-4 py-2 rounded font-pixel text-xl border-2 border-[#0f380f]"
                >
                  HINT: {hintText}
                </motion.div>
              )}
            </AnimatePresence>
          </RetroCard>

          {/* Options Grid */}
          {!showReveal ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {gameData.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleGuess(option.id)}
                  disabled={isProcessing}
                  className="group relative bg-white border-4 border-foreground/10 hover:border-primary rounded-lg p-4 flex flex-col items-center gap-2 transition-all hover:-translate-y-1 active:translate-y-0"
                >
                  <div className="w-20 h-20 flex items-center justify-center">
                    {/* In a real game we might hide the image or show a silhouette depending on difficulty */}
                    <PokemonSprite src={option.imageUrl} alt={option.name} size="md" />
                  </div>
                  <span className="font-retro text-[10px] uppercase text-center w-full truncate px-1 group-hover:text-primary">
                    {option.name}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            /* Reveal Card */
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border-4 border-primary rounded-lg p-8 text-center space-y-4"
            >
              <h2 className="font-retro text-2xl uppercase">
                {feedback === 'correct' ? "It's Correct!" : "Round Over!"}
              </h2>
              
              {revealedPokemon && (
                <div className="flex flex-col items-center">
                  <PokemonSprite src={revealedPokemon.imageUrl} alt={revealedPokemon.name} size="xl" />
                  <span className="font-retro text-xl mt-4 text-primary">{revealedPokemon.speciesName}</span>
                </div>
              )}

              <div className="flex justify-center pt-4">
                <RetroButton onClick={nextRound} className="w-full max-w-xs">
                  {isGameOver ? "View Results" : "Next Round"} <ArrowRight className="ml-2 w-4 h-4" />
                </RetroButton>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Column: Actions */}
        <div className="lg:col-span-4 space-y-6">
          <RetroCard>
            <h3 className="font-retro text-sm uppercase mb-4 flex items-center gap-2">
              <HelpCircle className="w-4 h-4" /> Hints
            </h3>
            <div className="space-y-3">
              <RetroButton 
                variant="outline" 
                className="w-full justify-between text-xs" 
                onClick={() => handleHint('generation')}
                disabled={!!hintText || showReveal}
              >
                <span>Reveal Gen</span>
                <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold">-1 PT</span>
              </RetroButton>
              <RetroButton 
                variant="outline" 
                className="w-full justify-between text-xs"
                onClick={() => handleHint('type')}
                disabled={!!hintText || showReveal}
              >
                <span>Reveal Type</span>
                <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold">-1 PT</span>
              </RetroButton>
            </div>
            <p className="font-pixel text-muted-foreground text-center mt-4 text-lg leading-tight">
              Using hints reduces your points earned for this round.
            </p>
          </RetroCard>

          <RetroCard className="bg-blue-50/50">
            <h3 className="font-retro text-sm uppercase mb-4 text-blue-900">Battle Log</h3>
            <div className="space-y-2 font-pixel text-lg h-40 overflow-y-auto pr-2">
              {feedback === 'wrong' && (
                <div className="flex items-center gap-2 text-red-600">
                  <X className="w-4 h-4" /> Wrong guess! Try again.
                </div>
              )}
              {feedback === 'correct' && (
                <div className="flex items-center gap-2 text-green-600">
                  <Check className="w-4 h-4" /> Correct! +{5 - (attempts-1) - hintsUsed} pts
                </div>
              )}
              {attempts > 1 && feedback !== 'correct' && (
                <div className="text-muted-foreground">
                  User attempted guess #{attempts-1}...
                </div>
              )}
              <div className="text-muted-foreground">
                Wild Pokemon appeared!
              </div>
            </div>
          </RetroCard>
        </div>

      </div>
    </Layout>
  );
}
