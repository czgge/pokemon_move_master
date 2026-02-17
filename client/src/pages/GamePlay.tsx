
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { useStartGame, useSubmitAnswer, useGetHint, useSubmitScore } from "@/hooks/use-game";
import { RetroButton } from "@/components/RetroButton";
import { RetroCard } from "@/components/RetroCard";
import { MoveCard } from "@/components/MoveCard";
import { GameHeader } from "@/components/GameHeader";
import { PokemonCombobox } from "@/components/PokemonCombobox";
import { Loader2, Lightbulb, Zap, ArrowRight, RotateCcw, Send } from "lucide-react";
import { Layout } from "@/components/Layout";

type GameState = {
  maxGen: number;
  score: number;
  lives: number;
  roundToken: string;
  moves: Array<{ name: string; type: string; power: number | null; accuracy: number | null; pp: number | null }>;
  generation: number;
  feedback: { message: string; type: "success" | "error" | "info" } | null;
  roundActive: boolean;
  hintsUsed: number;
  attempt: number;
  correctPokemon?: { name: string; imageUrl: string | null };
};

export default function GamePlay() {
  const [location, setLocation] = useLocation();
  const startGame = useStartGame();
  const submitAnswer = useSubmitAnswer();
  const getHint = useGetHint();

  const [selectedPokemon, setSelectedPokemon] = useState<{ id: number; name: string } | null>(null);

  const [config] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("gameConfig") || '{"maxGen": 1}');
    } catch {
      return { maxGen: 1 };
    }
  });

  const [state, setState] = useState<GameState>({
    maxGen: config.maxGen,
    score: 0,
    lives: 3,
    roundToken: "",
    moves: [],
    generation: 1,
    feedback: null,
    roundActive: false,
    hintsUsed: 0,
    attempt: 1,
  });

  const [hintMessage, setHintMessage] = useState<string | null>(null);

  useEffect(() => {
    startNewRound();
  }, []);

  const startNewRound = () => {
    setState(prev => ({ 
      ...prev, 
      feedback: null, 
      roundActive: false,
      hintsUsed: 0,
      attempt: 1,
      correctPokemon: undefined
    }));
    setHintMessage(null);
    setSelectedPokemon(null);

    startGame.mutate({ maxGen: state.maxGen }, {
      onSuccess: (data) => {
        setState(prev => ({
          ...prev,
          roundToken: data.roundToken,
          moves: data.moves,
          generation: data.generation,
          roundActive: true,
        }));
      },
      onError: (err: any) => {
        setState(prev => ({ ...prev, feedback: { message: `Failed to load round: ${err.message}`, type: "error" } }));
      }
    });
  };

  const handleGuess = () => {
    if (!state.roundActive || !selectedPokemon) return;

    submitAnswer.mutate({
      roundToken: state.roundToken,
      guessedPokemonId: selectedPokemon.id,
      attempt: state.attempt,
      hintsUsed: state.hintsUsed,
    }, {
      onSuccess: (data) => {
        if (data.correct) {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          });
          setState(prev => ({
            ...prev,
            score: prev.score + data.points,
            roundActive: false,
            feedback: { message: `Correct! It's ${selectedPokemon.name.replace(/-default.*/, "")}! (+${data.points})`, type: "success" },
            correctPokemon: data.correctPokemon ? { 
              name: data.correctPokemon.name, 
              imageUrl: data.correctPokemon.imageUrl 
            } : undefined
          }));
        } else {
          const nextAttempt = state.attempt + 1;
          
          if (nextAttempt > 3) {
            setState(prev => ({
              ...prev,
              lives: prev.lives - 1,
              roundActive: false,
              feedback: { message: "Wrong! Attempts exhausted.", type: "error" },
              correctPokemon: data.correctPokemon ? {
                name: data.correctPokemon.name,
                imageUrl: data.correctPokemon.imageUrl
              } : undefined
            }));
          } else {
            setState(prev => ({
              ...prev,
              attempt: nextAttempt,
              feedback: { message: `Wrong! Try again (${4 - nextAttempt} attempts left this round)`, type: "error" }
            }));
          }
        }
      }
    });
  };

  const requestHint = (type: "generation" | "type") => {
    if (!state.roundActive || getHint.isPending) return;
    
    getHint.mutate({ roundToken: state.roundToken, type }, {
      onSuccess: (data) => {
        setHintMessage(data.hint);
        setState(prev => ({ 
          ...prev, 
          hintsUsed: prev.hintsUsed + 1,
          score: Math.max(0, prev.score - 1)
        }));
      },
      onError: (err: any) => {
        setState(prev => ({ ...prev, feedback: { message: "Hint failed: " + err.message, type: "error" }}));
      }
    });
  };

  if (state.lives <= 0) {
    return (
      <GameOverScreen 
        score={state.score} 
        lastPokemon={state.correctPokemon} 
        onRestart={() => setLocation("/game/setup")} 
      />
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto pb-20">
        <GameHeader lives={state.lives} score={state.score} />

        <div className="mt-6 mb-8 text-center space-y-2">
          <h2 className="text-2xl md:text-3xl font-retro text-foreground pixel-text-shadow">
            WHO'S THAT POKÉMON?
          </h2>
          <p className="text-muted-foreground font-mono">
            Identify the Pokémon from its moveset (Gen {state.maxGen} Rules)
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {startGame.isPending ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-36 bg-muted animate-pulse rounded-lg pixel-border-sm" />
            ))
          ) : (
            state.moves.map((move, i) => (
              <MoveCard key={i} index={i} {...move} />
            ))
          )}
        </div>

        <AnimatePresence mode="wait">
          {!state.roundActive && state.correctPokemon ? (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex flex-col items-center justify-center p-8 bg-white pixel-border rounded-lg text-center gap-6"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                {state.correctPokemon.imageUrl && (
                  <img 
                    src={state.correctPokemon.imageUrl} 
                    alt="Correct Pokemon" 
                    className="w-48 h-48 object-contain relative z-10 pixelated drop-shadow-xl"
                  />
                )}
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-bold font-retro text-primary uppercase">
                  It's {state.correctPokemon.name.replace(/\(.*\)/, "").replace(/-default.*/, "").replace(/-/g, " ")}!
                </h3>
                <p className={`text-xl font-bold ${state.feedback?.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                  {state.feedback?.message}
                </p>
              </div>

              <RetroButton 
                size="lg" 
                onClick={startNewRound}
                className="w-full max-w-xs animate-bounce"
              >
                Next Round <ArrowRight className="ml-2 w-5 h-5" />
              </RetroButton>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {state.feedback && (
                <div className={`p-4 rounded pixel-border-sm text-center font-bold ${
                  state.feedback.type === 'error' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-blue-100 text-blue-700'
                }`}>
                  {state.feedback.message}
                </div>
              )}

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold uppercase tracking-wider ml-1">Your Guess:</label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <PokemonCombobox 
                        onSelect={(id, name) => setSelectedPokemon({ id, name })} 
                        maxGen={state.maxGen}
                        disabled={!state.roundActive || submitAnswer.isPending} 
                      />
                    </div>
                    <RetroButton 
                      onClick={handleGuess}
                      disabled={!state.roundActive || !selectedPokemon || submitAnswer.isPending}
                      className="px-6"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      GUESS
                    </RetroButton>
                  </div>
                  {selectedPokemon && (
                    <p className="text-xs text-primary font-bold mt-1">
                      Selected: <span className="uppercase">{selectedPokemon.name.replace(/-default.*/, "").replace(/-/g, " ")}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <RetroButton 
                  variant="outline" 
                  size="sm"
                  onClick={() => requestHint("generation")}
                  disabled={!state.roundActive || getHint.isPending}
                  className="text-xs md:text-sm"
                >
                  <Lightbulb className="w-4 h-4 mr-2" />
                  Gen Hint (-1 Pt)
                </RetroButton>
                <RetroButton 
                  variant="outline" 
                  size="sm"
                  onClick={() => requestHint("type")}
                  disabled={!state.roundActive || getHint.isPending}
                  className="text-xs md:text-sm"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Type Hint (-1 Pt)
                </RetroButton>
              </div>

              {hintMessage && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded text-center text-sm font-mono">
                  💡 HINT: {hintMessage}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}

function GameOverScreen({ score, lastPokemon, onRestart }: { score: number, lastPokemon?: { name: string, imageUrl: string | null }, onRestart: () => void }) {
  const [name, setName] = useState("");
  const submitScore = useSubmitScore();

  const handleSubmit = () => {
    if (!name.trim()) return;
    submitScore.mutate({
      playerName: name,
      score,
      genFilter: 9, 
    });
  };

  return (
    <Layout>
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-center p-4">
        <RetroCard className="w-full max-w-md p-8 space-y-8 bg-white/95">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-retro text-destructive mb-2">GAME OVER</h1>
            <p className="text-xl text-muted-foreground">You ran out of lives!</p>
          </div>

          {lastPokemon && (
            <div className="py-4 border-y-2 border-dashed border-gray-200">
              <p className="text-sm text-muted-foreground mb-2">The last Pokémon was:</p>
              <div className="flex flex-col items-center">
                 {lastPokemon.imageUrl && (
                   <img src={lastPokemon.imageUrl} className="w-24 h-24 object-contain pixelated" alt="Last Pokemon" />
                 )}
                 <p className="font-bold text-xl uppercase mt-2">{lastPokemon.name.replace(/-default.*/, "").replace(/-/g, " ")}</p>
              </div>
            </div>
          )}

          <div className="bg-muted p-6 rounded pixel-border-sm">
            <span className="block text-sm uppercase tracking-widest text-muted-foreground mb-1">Final Score</span>
            <span className="block text-5xl font-retro text-primary">{score}</span>
          </div>

              {!submitScore.isSuccess ? (
                <div className="space-y-4">
                  <input 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ENTER YOUR NAME"
                    className="w-full p-3 text-center font-retro text-lg uppercase bg-white border-2 border-foreground rounded focus:outline-none focus:border-primary"
                    maxLength={10}
                  />
                  <RetroButton 
                    onClick={handleSubmit} 
                    className="w-full"
                    isLoading={submitScore.isPending}
                    disabled={!name.trim()}
                  >
                    Submit Score
                  </RetroButton>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-green-600 font-bold text-xl">Score Submitted!</div>
                  <RetroButton variant="outline" onClick={() => window.location.href = "/leaderboard"} className="w-full">
                    View Leaderboard
                  </RetroButton>
                </div>
              )}

          <RetroButton variant="ghost" onClick={onRestart} className="w-full mt-4">
            <RotateCcw className="w-4 h-4 mr-2" />
            Play Again
          </RetroButton>
        </RetroCard>
      </div>
    </Layout>
  );
}

  // No need for inline hook, use the one from hooks/use-game.ts
