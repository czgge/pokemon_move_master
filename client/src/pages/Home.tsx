import { Layout } from "@/components/Layout";
import { RetroButton } from "@/components/RetroButton";
import { RetroCard } from "@/components/RetroCard";
import { useLocation } from "wouter";
import { Gamepad2, Trophy, BookOpen, Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

export default function Home() {
  const [_, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 md:gap-8 px-4">
        
        {/* Theme Toggle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute top-4 right-4"
        >
          <button
            onClick={toggleTheme}
            className="p-3 rounded-lg pixel-border bg-background hover:bg-accent transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <Moon className="w-5 h-5 text-foreground" />
            ) : (
              <Sun className="w-5 h-5 text-foreground" />
            )}
          </button>
        </motion.div>
        
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
          
          <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-retro leading-tight text-foreground drop-shadow-sm px-4">
            WHO'S THAT <span className="text-primary block md:inline mt-2 md:mt-0">POKEMON?</span>
          </h1>
          
          <p className="font-pixel text-base sm:text-xl md:text-2xl text-muted-foreground max-w-lg mx-auto leading-relaxed font-mono px-4">
            Test your knowledge! Can you guess the Pokémon based only on its unique moveset?
          </p>
        </motion.div>

        {/* Action Buttons */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-md"
        >
          <RetroButton 
            variant="primary" 
            className="h-14 md:h-16 text-base md:text-lg w-full shadow-lg hover:-translate-y-1"
            onClick={() => setLocation("/game/setup")}
          >
            <Gamepad2 className="w-6 h-6 mr-2" />
            START GAME
          </RetroButton>
        </motion.div>
        
        {/* Features / Quick Links */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 w-full mt-6 md:mt-8 max-w-2xl px-4"
        >
          <QuickLinkCard 
            title="Leaderboard" 
            icon={Trophy} 
            description="Top players & scores"
            onClick={() => setLocation("/leaderboard")}
            color="text-yellow-500"
          />
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
