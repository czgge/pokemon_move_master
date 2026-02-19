import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface RetroCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "screen" | "primary" | "secondary";
  onClick?: () => void;
}

export function RetroCard({ children, className, variant = "default", onClick }: RetroCardProps) {
  const variants = {
    default: "bg-card text-card-foreground border-foreground",
    screen: "bg-[#9da525] dark:bg-[#7a8520] border-[#8b9121] dark:border-[#6a7118] inset-shadow text-[#0f380f] dark:text-[#0a2a0a]", // Original Gameboy green tint
    primary: "bg-primary text-primary-foreground border-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground border-foreground",
  };

  return (
    <div 
      onClick={onClick}
      className={cn(
        "relative rounded-sm p-4 pixel-border transition-all duration-200",
        variants[variant],
        onClick && "cursor-pointer active:translate-y-1 active:shadow-none hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)]",
        className
      )}
    >
      {/* Corner accents for that mechanical feel */}
      <div className="absolute top-1 left-1 w-1 h-1 bg-current opacity-20" />
      <div className="absolute top-1 right-1 w-1 h-1 bg-current opacity-20" />
      <div className="absolute bottom-1 left-1 w-1 h-1 bg-current opacity-20" />
      <div className="absolute bottom-1 right-1 w-1 h-1 bg-current opacity-20" />
      
      {children}
    </div>
  );
}
