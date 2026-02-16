import { useState } from "react";
import { Layout } from "@/components/Layout";
import { RetroButton } from "@/components/RetroButton";
import { RetroCard } from "@/components/RetroCard";
import { useLocation } from "wouter";
import { useStartGame } from "@/hooks/use-game";
import { motion } from "framer-motion";

const GENERATIONS = [
  { id: 1, name: "Kanto", color: "bg-red-500", text: "text-red-900" },
  { id: 2, name: "Johto", color: "bg-yellow-400", text: "text-yellow-900" },
  { id: 3, name: "Hoenn", color: "bg-green-500", text: "text-green-900" },
  { id: 4, name: "Sinnoh", color: "bg-blue-400", text: "text-blue-900" },
  { id: 5, name: "Unova", color: "bg-gray-200", text: "text-gray-900" },
  { id: 6, name: "Kalos", color: "bg-pink-400", text: "text-pink-900" },
  { id: 7, name: "Alola", color: "bg-orange-400", text: "text-orange-900" },
  { id: 8, name: "Galar", color: "bg-purple-400", text: "text-purple-900" },
  { id: 9, name: "Paldea", color: "bg-indigo-400", text: "text-indigo-900" },
];

export default function GameSetup() {
  const [selectedGen, setSelectedGen] = useState(3); // Default to Gen 3
  const [_, setLocation] = useLocation();
  const startGame = useStartGame();

  const handleStart = async () => {
    try {
      const gameData = await startGame.mutateAsync(selectedGen);
      // Store initial game data in sessionStorage or state management
      sessionStorage.setItem("currentGame", JSON.stringify(gameData));
      setLocation("/game/play");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="font-retro text-2xl md:text-3xl">Select Generation</h1>
          <p className="font-pixel text-xl text-muted-foreground">
            Include Pokemon up to which generation?
          </p>
        </div>

        <RetroCard className="p-8">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {GENERATIONS.map((gen) => (
              <motion.button
                key={gen.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedGen(gen.id)}
                className={`
                  relative p-4 rounded-lg border-4 transition-all duration-200
                  flex flex-col items-center gap-2
                  ${selectedGen === gen.id 
                    ? `border-primary shadow-lg bg-primary/5` 
                    : "border-transparent bg-muted/30 hover:bg-muted/50 hover:border-muted-foreground/30"}
                `}
              >
                <div className={`
                  w-12 h-12 rounded-full flex items-center justify-center font-retro text-lg
                  ${gen.color} ${gen.text} border-2 border-current
                `}>
                  {gen.id}
                </div>
                <span className={`font-retro text-xs uppercase ${selectedGen === gen.id ? "text-primary" : "text-muted-foreground"}`}>
                  {gen.name}
                </span>
                
                {selectedGen === gen.id && (
                  <div className="absolute top-2 right-2 w-3 h-3 bg-primary rounded-full animate-bounce" />
                )}
              </motion.button>
            ))}
          </div>
        </RetroCard>

        <div className="flex justify-center pt-4">
          <RetroButton 
            variant="primary" 
            className="w-full max-w-sm h-14 text-lg"
            onClick={handleStart}
            isLoading={startGame.isPending}
          >
            Start Adventure
          </RetroButton>
        </div>
      </div>
    </Layout>
  );
}
