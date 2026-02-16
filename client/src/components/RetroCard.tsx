import { cn } from "@/lib/utils";

interface RetroCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: "default" | "screen" | "primary" | "secondary";
}

export function RetroCard({ children, className, variant = "default", ...props }: RetroCardProps) {
  const variants = {
    default: "bg-white border-4 border-foreground/80 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]",
    screen: "bg-[#9bbc0f] inner-shadow border-4 border-foreground/60 shadow-inner", // Gameboy green
    primary: "bg-primary text-primary-foreground border-4 border-primary-foreground/50",
    secondary: "bg-secondary text-secondary-foreground border-4 border-secondary-foreground/50",
  };

  return (
    <div className={cn("rounded-sm p-4 relative", variants[variant], className)} {...props}>
      {/* Corner accents for tech feel */}
      {variant === 'default' && (
        <>
          <div className="absolute top-1 left-1 w-2 h-2 border-t-2 border-l-2 border-foreground/20" />
          <div className="absolute top-1 right-1 w-2 h-2 border-t-2 border-r-2 border-foreground/20" />
          <div className="absolute bottom-1 left-1 w-2 h-2 border-b-2 border-l-2 border-foreground/20" />
          <div className="absolute bottom-1 right-1 w-2 h-2 border-b-2 border-r-2 border-foreground/20" />
        </>
      )}
      {children}
    </div>
  );
}
