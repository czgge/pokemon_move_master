import { Link } from "wouter";
import { RetroCard } from "@/components/RetroCard";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <RetroCard className="w-full max-w-md text-center p-8 space-y-6">
        <div className="flex justify-center">
          <AlertTriangle className="h-20 w-20 text-yellow-500 animate-pulse" />
        </div>
        
        <h1 className="text-4xl font-retro text-foreground">404</h1>
        <p className="text-xl font-mono text-muted-foreground">
          A wild MissingNo appeared! <br/>
          This page does not exist.
        </p>

        <Link href="/" className="inline-block px-6 py-3 rounded-lg bg-primary text-primary-foreground font-retro uppercase tracking-wider hover:bg-primary/90 transition-colors">
          Return to Safety
        </Link>
      </RetroCard>
    </div>
  );
}
