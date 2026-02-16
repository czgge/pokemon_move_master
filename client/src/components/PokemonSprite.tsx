import { useState } from 'react';
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PokemonSpriteProps {
  src?: string | null;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  pixelated?: boolean;
}

export function PokemonSprite({ src, alt, size = 'md', className, pixelated = true }: PokemonSpriteProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const sizes = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
    xl: "w-48 h-48",
  };

  return (
    <div className={cn("relative flex items-center justify-center shrink-0", sizes[size], className)}>
      {!loaded && !error && (
        <Skeleton className="absolute inset-0 bg-black/10 rounded-full animate-pulse" />
      )}
      
      {error ? (
        <div className="flex flex-col items-center justify-center text-muted-foreground text-xs text-center p-2">
          <span className="font-bold">?</span>
          <span>MissingNo</span>
        </div>
      ) : (
        <img
          src={src || undefined}
          alt={alt}
          className={cn(
            "object-contain w-full h-full transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
            pixelated && "image-pixelated" // Custom utility if needed or use standard rendering
          )}
          style={{ imageRendering: 'pixelated' }}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}
