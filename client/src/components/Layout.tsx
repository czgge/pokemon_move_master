import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Gamepad2, BookOpen, Trophy } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Home", icon: Gamepad2 },
    { href: "/pokedex", label: "Dex", icon: BookOpen },
    { href: "/leaderboard", label: "Rank", icon: Trophy },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-retro-body selection:bg-primary selection:text-white flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <div className="w-8 h-8 bg-red-600 rounded-full border-4 border-black flex items-center justify-center">
              <div className="w-3 h-3 bg-white rounded-full border border-black/50" />
            </div>
            <span className="hidden font-retro font-bold sm:inline-block">
              POKÉGUESS
            </span>
          </Link>
          
          <nav className="flex items-center space-x-6 text-sm font-medium">
            {navItems.map((item) => (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "transition-colors hover:text-foreground/80 flex items-center gap-2 uppercase tracking-wide",
                  location === item.href ? "text-primary" : "text-foreground/60"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 container py-6 md:py-10 animate-in fade-in duration-500">
        {children}
      </main>

      <footer className="border-t border-border py-6 md:px-8 md:py-0">
        <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left font-mono">
            Built for Pokémon fans. Data provided by PokéAPI. 
            <br />
            Pokémon and Pokémon character names are trademarks of Nintendo.
          </p>
        </div>
      </footer>
    </div>
  );
}
