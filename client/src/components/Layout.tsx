import { Link, useLocation } from "wouter";
import { Gamepad2, Trophy, BookOpen, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { RetroButton } from "./RetroButton";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  const NavLink = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => {
    const isActive = location === href;
    return (
      <Link href={href} className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-md transition-colors font-retro text-xs uppercase tracking-wider",
        isActive 
          ? "bg-primary text-primary-foreground shadow-sm" 
          : "hover:bg-muted text-muted-foreground hover:text-foreground"
      )}>
        <Icon className="w-5 h-5" />
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col font-sans">
      {/* Retro Header */}
      <header className="sticky top-0 z-50 w-full border-b-4 border-foreground/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-primary rounded-full border-4 border-foreground/80 flex items-center justify-center group-hover:rotate-12 transition-transform">
              <div className="w-2 h-2 bg-white rounded-full opacity-50" />
            </div>
            <span className="font-retro text-sm md:text-base font-bold tracking-tighter">
              Who's That Mon?
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-2">
            <NavLink href="/" icon={Gamepad2} label="Play" />
            <NavLink href="/pokedex" icon={BookOpen} label="Dex" />
            <NavLink href="/leaderboard" icon={Trophy} label="Rank" />
          </nav>

          {/* Mobile Nav */}
          <div className="md:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <RetroButton variant="ghost" className="p-2">
                  <Menu className="w-6 h-6" />
                </RetroButton>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] border-l-4 border-foreground bg-background p-0">
                <div className="flex flex-col gap-2 p-6 mt-8">
                  <div onClick={() => setOpen(false)}>
                    <NavLink href="/" icon={Gamepad2} label="Play Game" />
                  </div>
                  <div onClick={() => setOpen(false)}>
                    <NavLink href="/pokedex" icon={BookOpen} label="Pokedex" />
                  </div>
                  <div onClick={() => setOpen(false)}>
                    <NavLink href="/leaderboard" icon={Trophy} label="Leaderboard" />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container max-w-5xl mx-auto px-4 py-8 md:py-12">
        <div className="relative">
          {/* Decorative background elements */}
          <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none -z-10 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]" />
          
          {children}
        </div>
      </main>

      <footer className="border-t-4 border-foreground/10 py-8 bg-white/50">
        <div className="container px-4 text-center text-sm text-muted-foreground font-pixel">
          <p>© 2024 Who's That Mon? • Not affiliated with Nintendo/Game Freak</p>
          <p className="mt-1">Made for the love of Pokemon</p>
        </div>
      </footer>
    </div>
  );
}
