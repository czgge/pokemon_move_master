import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { RetroCard } from "@/components/RetroCard";
import { RetroButton } from "@/components/RetroButton";
import { Slider } from "@/components/ui/slider";
import { Gamepad2, Heart, Lightbulb, Flame, Zap, Skull } from "lucide-react";

type Difficulty = "easy" | "medium" | "hard";

export default function GameSetup() {
  const [_, setLocation] = useLocation();
  const [gen, setGen] = useState([1]);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");

  const handleStart = () => {
    // Save config to session storage to persist across reloads
    sessionStorage.setItem("gameConfig", JSON.stringify({ maxGen: gen[0], difficulty }));
    // Clear previous game's seen movesets
    sessionStorage.removeItem("seenMovesets");
    setLocation("/game/play");
  };

  const genDescriptions = [
    "", // 0 index unused
    "Kanto (Red/Blue)",
    "Johto (Gold/Silver)",
    "Hoenn (Ruby/Sapphire)",
    "Sinnoh (Diamond/Pearl)",
    "Unova (Black/White)",
    "Kalos (X/Y)",
    "Alola (Sun/Moon)",
    "Galar (Sword/Shield)",
    "Paldea (Scarlet/Violet)"
  ];

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-4">
        <RetroCard className="w-full max-w-2xl p-10 space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-retro text-foreground">GAME SETUP</h1>
            <p className="text-lg text-muted-foreground font-mono">Configure your challenge</p>
          </div>

          <div className="space-y-6 bg-muted/30 p-8 rounded pixel-border-sm">
            <div className="flex justify-between items-end">
              <label className="text-base font-bold uppercase tracking-wider">Max Generation</label>
              <span className="text-5xl font-retro text-primary leading-none">{gen[0]}</span>
            </div>

            <Slider
              value={gen}
              onValueChange={setGen}
              max={9}
              min={1}
              step={1}
              className="py-4"
            />

            <div className="text-center p-4 bg-white rounded border border-border">
              <p className="font-bold text-base uppercase mb-2">Includes Pokémon from:</p>
              <p className="text-xl font-retro text-secondary-foreground">Gen 1 - Gen {gen[0]}</p>
              <p className="text-sm text-muted-foreground mt-2 font-mono">{genDescriptions[gen[0]]}</p>
            </div>
          </div>

          {/* Difficulty Selection */}
          <div className="space-y-4">
            <label className="text-base font-bold uppercase tracking-wider block text-center">Difficulty</label>
            
            <div className="grid grid-cols-3 gap-3">
              <DifficultyCard
                difficulty="easy"
                selected={difficulty === "easy"}
                onClick={() => setDifficulty("easy")}
                icon={Heart}
                title="Easy"
                lives={3}
                hints="2 hints"
                multiplier="Score x1"
                color="text-green-600"
              />
              <DifficultyCard
                difficulty="medium"
                selected={difficulty === "medium"}
                onClick={() => setDifficulty("medium")}
                icon={Zap}
                title="Medium"
                lives={2}
                hints="1 hint"
                multiplier="Score x2"
                color="text-yellow-600"
              />
              <DifficultyCard
                difficulty="hard"
                selected={difficulty === "hard"}
                onClick={() => setDifficulty("hard")}
                icon={Skull}
                title="Hard"
                lives={1}
                hints="No hints"
                multiplier="Score x3"
                color="text-red-600"
              />
            </div>
          </div>

          <div className="space-y-4">
            <RetroButton onClick={handleStart} size="lg" className="w-full text-2xl py-10">
              <Gamepad2 className="w-8 h-8 mr-3" />
              START GAME
            </RetroButton>
            
            <p className="text-sm text-center text-muted-foreground px-4">
              * Movesets will be historically accurate to the selected generation cap.
            </p>
          </div>
        </RetroCard>
      </div>
    </Layout>
  );
}


function DifficultyCard({ difficulty, selected, onClick, icon: Icon, title, lives, hints, multiplier, color }: any) {
  return (
    <button
      onClick={onClick}
      className={`p-6 rounded pixel-border-sm transition-all ${
        selected 
          ? 'bg-primary/10 border-primary border-2 scale-105' 
          : 'bg-white border-border hover:border-primary/50'
      }`}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Icon className={`w-10 h-10 ${selected ? 'text-primary' : color}`} />
        <h3 className="font-retro text-base uppercase">{title}</h3>
        <div className="text-sm text-muted-foreground space-y-2 font-mono">
          <p className="text-base">{lives} ❤️</p>
          <p className="text-base">{hints}</p>
          <p className="font-bold text-foreground text-base">{multiplier}</p>
        </div>
      </div>
    </button>
  );
}
