import { Layout } from "@/components/Layout";
import { RetroButton } from "@/components/RetroButton";
import { RetroCard } from "@/components/RetroCard";
import { useLocation } from "wouter";
import { Gamepad2, Trophy, BookOpen, Star } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function Home() {
  const [_, setLocation] = useLocation();

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
        
        {/* Hero Section */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-4 max-w-2xl"
        >
          <div className="inline-block px-4 py-1 rounded-full bg-accent/20 text-accent-foreground font-retro text-[10px] tracking-widest uppercase mb-4 border-2 border-accent">
            The Ultimate Moveset Challenge
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-retro leading-tight text-foreground drop-shadow-sm">
            WHO'S THAT <span className="text-primary block md:inline mt-2 md:mt-0">POKEMON?</span>
          </h1>
          
          <p className="font-pixel text-xl md:text-2xl text-muted-foreground max-w-lg mx-auto leading-relaxed font-mono">
            Test your knowledge! Can you guess the Pokémon based only on its unique moveset?
          </p>
        </motion.div>

        {/* Action Buttons */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg"
        >
          <RetroButton 
            variant="primary" 
            className="h-16 text-lg w-full shadow-lg hover:-translate-y-1"
            onClick={() => setLocation("/game/setup")}
          >
            <Gamepad2 className="w-6 h-6 mr-2" />
            START GAME
          </RetroButton>
          
          <RetroButton 
            variant="outline" 
            className="h-16 text-lg w-full bg-white"
            onClick={() => setLocation("/leaderboard")}
          >
            <Trophy className="w-6 h-6 mr-2" />
            LEADERBOARD
          </RetroButton>
        </motion.div>
        
        {/* Features / Quick Links */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="grid grid-cols-1 sm:grid-cols-1 gap-6 w-full mt-12 max-w-sm"
        >
          <QuickLinkCard 
            title="Pokedex" 
            icon={BookOpen} 
            description="Browse movesets & stats"
            onClick={() => setLocation("/pokedex")}
            color="text-blue-500"
          />
        </motion.div>
      </div>
    </Layout>
  );
}

function QuickLinkCard({ title, icon: Icon, description, onClick, color }: any) {
  return (
    <RetroCard 
      className="cursor-pointer hover:border-primary/50 transition-colors group"
      onClick={onClick}
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className={cn("p-3 rounded-full bg-muted group-hover:bg-background transition-colors border-2 border-transparent group-hover:border-current", color)}>
          <Icon className="w-8 h-8" />
        </div>
        <h3 className="font-retro text-xs uppercase mt-2">{title}</h3>
        <p className="font-pixel text-lg text-muted-foreground leading-none font-mono">{description}</p>
      </div>
    </RetroCard>
  );
}
