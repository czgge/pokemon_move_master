
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
  wrongGuesses: number[]; // Track wrong Pokemon IDs for this round
};

export default function GamePlay() {
  const [location, setLocation] = useLocation();
  const startGame = useStartGame();
  const submitAnswer = useSubmitAnswer();
  const getHint = useGetHint();

  const [selectedPokemon, setSelectedPokemon] = useState<{ id: number; name: string } | null>(null);

  const [config] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("gameConfig") || '{"maxGen": 1, "difficulty": "easy"}');
      return { maxGen: saved.maxGen || 1, difficulty: saved.difficulty || "easy" };
    } catch {
      return { maxGen: 1, difficulty: "easy" };
    }
  });

  // Difficulty settings
  const difficultySettings = {
    easy: { lives: 3, hintsAllowed: Infinity, scoreMultiplier: 1 },
    medium: { lives: 2, hintsAllowed: 1, scoreMultiplier: 2 },
    hard: { lives: 1, hintsAllowed: 0, scoreMultiplier: 3 },
  };

  const currentDifficulty = difficultySettings[config.difficulty as keyof typeof difficultySettings] || difficultySettings.easy;

  const [state, setState] = useState<GameState>({
    maxGen: config.maxGen,
    score: 0,
    lives: currentDifficulty.lives,
    roundToken: "",
    moves: [],
    generation: 1,
    feedback: null,
    roundActive: false,
    hintsUsed: 0,
    attempt: 1,
    wrongGuesses: [],
  });

  const [usedHints, setUsedHints] = useState<{ generation?: string; type?: string }>({});

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
      correctPokemon: undefined,
      wrongGuesses: [], // Reset wrong guesses for new round
    }));
    setUsedHints({}); // Reset hints for new round
    setSelectedPokemon(null);

    // Get seen movesets from session storage
    const seenMovesetsStr = sessionStorage.getItem("seenMovesets");
    const seenMovesets = seenMovesetsStr ? JSON.parse(seenMovesetsStr) : [];

    startGame.mutate({ maxGen: config.maxGen, seenMovesets }, {
      onSuccess: (data) => {
        // Create moveset key and add to seen list
        const movesetKey = data.moves.map(m => m.name).sort().join('|');
        const updatedSeen = [...seenMovesets, movesetKey];
        sessionStorage.setItem("seenMovesets", JSON.stringify(updatedSeen));
        
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
    
    // Check if this Pokemon was already guessed wrong in this round
    if (state.wrongGuesses.includes(selectedPokemon.id)) {
      setState(prev => ({
        ...prev,
        feedback: { 
          message: `You already tried ${formatName(selectedPokemon.name)} in this round!`, 
          type: "error" 
        }
      }));
      return;
    }

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
          
          if (data.correctPokemon?.cryUrl) {
            const audio = new Audio(data.correctPokemon.cryUrl);
            audio.play().catch(e => console.error("Error playing cry:", e));
          }

          setState(prev => ({
            ...prev,
            score: prev.score + (data.points * currentDifficulty.scoreMultiplier),
            roundActive: false,
            feedback: { message: `Correct! It's ${formatName(selectedPokemon.name)}! (+${data.points * currentDifficulty.scoreMultiplier})`, type: "success" },
            correctPokemon: data.correctPokemon ? { 
              name: data.correctPokemon.name, 
              imageUrl: data.correctPokemon.imageUrl 
            } : undefined
          }));
        } else {
          const nextAttempt = state.attempt + 1;
          
          console.log('[GamePlay] Wrong answer data:', data);
          console.log('[GamePlay] Missing moves:', data.missingMoves);
          
          // Build feedback message with missing moves
          let feedbackMessage = `Wrong! ${formatName(selectedPokemon.name)}`;
          if (data.missingMoves && data.missingMoves.length > 0) {
            const movesList = data.missingMoves.map((m: string) => m.replace(/-/g, ' ')).join(', ');
            feedbackMessage += ` cannot learn: ${movesList}`;
          }
          
          console.log('[GamePlay] Feedback message:', feedbackMessage);
          
          if (nextAttempt > 3) {
            if (data.correctPokemon?.cryUrl) {
              const audio = new Audio(data.correctPokemon.cryUrl);
              audio.play().catch(e => console.error("Error playing cry:", e));
            }
            setState(prev => ({
              ...prev,
              lives: prev.lives - 1,
              roundActive: false,
              feedback: { message: feedbackMessage, type: "error" },
              correctPokemon: data.correctPokemon ? {
                name: data.correctPokemon.name,
                imageUrl: data.correctPokemon.imageUrl
              } : undefined,
              wrongGuesses: [...prev.wrongGuesses, selectedPokemon.id], // Add to wrong guesses
            }));
          } else {
            feedbackMessage += ` (${4 - nextAttempt} attempts left)`;
            setState(prev => ({
              ...prev,
              attempt: nextAttempt,
              feedback: { message: feedbackMessage, type: "error" },
              wrongGuesses: [...prev.wrongGuesses, selectedPokemon.id], // Add to wrong guesses
            }));
          }
        }
      }
    });
  };

  const formatName = (name: string) => {
    if (!name) return "";
    
    // Remove "-default" suffix
    let formatted = name.replace(/-default.*/, "");
    
    // Handle cases like "arceus-fighting (Fighting Form)" or "charizard (Mega Evolution X)"
    const match = formatted.match(/^([^(]+)\s*\((.+)\)$/);
    if (match) {
      let baseName = match[1].trim().replace(/-/g, " ");
      const formName = match[2].trim();
      
      // Split base name into words
      const baseWords = baseName.toLowerCase().split(/\s+/);
      const formWords = formName.toLowerCase().split(/\s+/);
      
      // Get the species name (first word)
      const baseSpecies = baseWords[0];
      const baseDescriptors = baseWords.slice(1); // e.g., ["fighting"] from "arceus fighting"
      
      // Check if form name contains the base descriptors (redundant info)
      const redundantWords = baseDescriptors.filter(desc => formWords.includes(desc));
      
      if (redundantWords.length > 0) {
        // Remove redundant words from form name
        // e.g., "Fighting Form" with redundant "fighting" -> "Form"
        let cleanedFormWords = formWords.filter(word => !redundantWords.includes(word));
        
        // Capitalize properly
        const cleanedForm = cleanedFormWords
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
        
        // Return "Species Descriptor Form" (e.g., "Arceus Fighting Form")
        const capitalizedSpecies = baseSpecies.charAt(0).toUpperCase() + baseSpecies.slice(1);
        const capitalizedDescriptors = baseDescriptors
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
        
        return `${capitalizedSpecies} ${capitalizedDescriptors} ${cleanedForm}`.trim();
      } else {
        // No redundancy, return "Species (Form)" format
        // e.g., "Charizard (Mega Evolution X)" -> "Charizard Mega Evolution X"
        const capitalizedSpecies = baseSpecies.charAt(0).toUpperCase() + baseSpecies.slice(1);
        return `${capitalizedSpecies} ${formName}`;
      }
    }
    
    // No parentheses, just replace hyphens and capitalize
    return formatted.split(/\s+/).map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(" ");
  };

  const requestHint = (type: "generation" | "type") => {
    if (!state.roundActive || getHint.isPending || usedHints[type]) return; // Don't allow if already used
    
    // Check if hints are allowed based on difficulty
    const totalHintsUsed = Object.keys(usedHints).length;
    if (totalHintsUsed >= currentDifficulty.hintsAllowed) {
      setState(prev => ({ ...prev, feedback: { message: "No more hints available in this difficulty!", type: "error" }}));
      return;
    }
    
    getHint.mutate({ roundToken: state.roundToken, type }, {
      onSuccess: (data) => {
        setUsedHints(prev => ({ ...prev, [type]: data.hint })); // Store the hint message
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

  const handleReset = () => {
    if (!confirm("Are you sure you want to restart the game? Your current score will be lost.")) {
      return;
    }
    
    // Clear seen movesets
    sessionStorage.removeItem("seenMovesets");
    
    // Reset state with difficulty-based lives
    setState({
      maxGen: config.maxGen,
      score: 0,
      lives: currentDifficulty.lives,
      roundToken: "",
      moves: [],
      generation: 1,
      feedback: null,
      roundActive: false,
      hintsUsed: 0,
      attempt: 1,
      wrongGuesses: [],
    });
    
    setUsedHints({});
    setSelectedPokemon(null);
    
    // Start new round
    startNewRound();
  };

  if (state.lives <= 0) {
    return (
      <GameOverScreen 
        score={state.score} 
        maxGen={state.maxGen}
        lastPokemon={state.correctPokemon} 
        onRestart={() => setLocation("/game/setup")} 
      />
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto pb-20">
        <GameHeader lives={state.lives} score={state.score} onReset={handleReset} />

        <div className="mt-6 mb-8 text-center space-y-2 px-4">
          <h2 className="text-2xl md:text-3xl font-retro text-foreground pixel-text-shadow break-words">
            WHO'S THAT POKÉMON?
          </h2>
          <p className="text-muted-foreground font-mono text-sm md:text-base">
            Identify the Pokémon from its moveset (Gen {state.maxGen} Rules)
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 w-full px-4">
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
                <div className={`p-4 rounded pixel-border-sm text-center font-bold break-words ${
                  state.feedback.type === 'error' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-blue-100 text-blue-700'
                }`}>
                  {state.feedback.message}
                </div>
              )}

              <div className="flex flex-col gap-4 px-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold uppercase tracking-wider ml-1">Your Guess:</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1">
                      <PokemonCombobox 
                        onSelect={(id, name) => setSelectedPokemon({ id, name })} 
                        maxGen={state.maxGen}
                        disabled={!state.roundActive || submitAnswer.isPending}
                        excludeIds={state.wrongGuesses} // Exclude already guessed Pokemon
                      />
                    </div>
                    <RetroButton 
                      onClick={handleGuess}
                      disabled={!state.roundActive || !selectedPokemon || submitAnswer.isPending}
                      className="px-6 py-3 sm:py-0 h-12 sm:h-auto"
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

              <div className="grid grid-cols-2 gap-4 px-4">
                <RetroButton 
                  variant="outline" 
                  size="sm"
                  onClick={() => requestHint("generation")}
                  disabled={
                    !state.roundActive || 
                    getHint.isPending || 
                    !!usedHints.generation || 
                    currentDifficulty.hintsAllowed === 0 ||
                    Object.keys(usedHints).length >= currentDifficulty.hintsAllowed
                  }
                  className="text-xs md:text-sm"
                >
                  <Lightbulb className="w-4 h-4 mr-2" />
                  {currentDifficulty.hintsAllowed === 0 
                    ? "No Hints" 
                    : usedHints.generation 
                      ? "Used" 
                      : "Gen Hint (-1 Pt)"}
                </RetroButton>
                <RetroButton 
                  variant="outline" 
                  size="sm"
                  onClick={() => requestHint("type")}
                  disabled={
                    !state.roundActive || 
                    getHint.isPending || 
                    !!usedHints.type || 
                    currentDifficulty.hintsAllowed === 0 ||
                    Object.keys(usedHints).length >= currentDifficulty.hintsAllowed
                  }
                  className="text-xs md:text-sm"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  {currentDifficulty.hintsAllowed === 0 
                    ? "No Hints" 
                    : usedHints.type 
                      ? "Used" 
                      : "Type Hint (-1 Pt)"}
                </RetroButton>
              </div>

              {(usedHints.generation || usedHints.type) && (
                <div className="px-4 space-y-2">
                  {usedHints.generation && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded text-center text-sm font-mono">
                      💡 {usedHints.generation}
                    </div>
                  )}
                  {usedHints.type && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded text-center text-sm font-mono">
                      ⚡ {usedHints.type}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}

function GameOverScreen({ score, maxGen, lastPokemon, onRestart }: { score: number, maxGen: number, lastPokemon?: { name: string, imageUrl: string | null }, onRestart: () => void }) {
  const [name, setName] = useState("");
  const submitScore = useSubmitScore();

  const handleSubmit = () => {
    if (!name.trim()) return;
    submitScore.mutate({
      playerName: name,
      score,
      genFilter: maxGen, 
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
                    maxLength={20}
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
