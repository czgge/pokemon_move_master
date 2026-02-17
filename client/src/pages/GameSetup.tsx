import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { RetroCard } from "@/components/RetroCard";
import { RetroButton } from "@/components/RetroButton";
import { Slider } from "@/components/ui/slider";
import { Gamepad2 } from "lucide-react";

export default function GameSetup() {
  const [_, setLocation] = useLocation();
  const [gen, setGen] = useState([1]);

  const handleStart = () => {
    // Save config to session storage to persist across reloads
    sessionStorage.setItem("gameConfig", JSON.stringify({ maxGen: gen[0] }));
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
        <RetroCard className="w-full max-w-lg p-8 space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-2xl md:text-3xl font-retro text-foreground">GAME SETUP</h1>
            <p className="text-muted-foreground font-mono">Configure your challenge</p>
          </div>

          <div className="space-y-6 bg-muted/30 p-6 rounded pixel-border-sm">
            <div className="flex justify-between items-end">
              <label className="text-sm font-bold uppercase tracking-wider">Max Generation</label>
              <span className="text-4xl font-retro text-primary leading-none">{gen[0]}</span>
            </div>

            <Slider
              value={gen}
              onValueChange={setGen}
              max={9}
              min={1}
              step={1}
              className="py-4"
            />

            <div className="text-center p-3 bg-white rounded border border-border">
              <p className="font-bold text-sm uppercase mb-1">Includes Pokémon from:</p>
              <p className="text-lg font-retro text-secondary-foreground">Gen 1 - Gen {gen[0]}</p>
              <p className="text-xs text-muted-foreground mt-2 font-mono">{genDescriptions[gen[0]]}</p>
            </div>
          </div>

          <div className="space-y-4">
            <RetroButton onClick={handleStart} size="lg" className="w-full text-xl py-8">
              <Gamepad2 className="w-6 h-6 mr-3" />
              START GAME
            </RetroButton>
            
            <p className="text-xs text-center text-muted-foreground px-4">
              * Movesets will be historically accurate to the selected generation cap.
            </p>
          </div>
        </RetroCard>
      </div>
    </Layout>
  );
}
