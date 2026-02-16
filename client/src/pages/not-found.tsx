import { Link } from "wouter";
import { RetroCard } from "@/components/RetroCard";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <RetroCard className="w-full max-w-md text-center p-8 space-y-6">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        
        <h1 className="font-retro text-2xl">404 Page Not Found</h1>
        <p className="font-pixel text-xl text-muted-foreground">
          A wild error appeared! This page cannot be found.
        </p>

        <Link href="/" className="inline-block mt-4 retro-btn bg-primary text-primary-foreground">
          Return Home
        </Link>
      </RetroCard>
    </div>
  );
}
