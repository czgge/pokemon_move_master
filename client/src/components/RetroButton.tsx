import React from 'react';
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface RetroButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  isLoading?: boolean;
}

export function RetroButton({ 
  children, 
  className, 
  variant = "primary", 
  isLoading,
  disabled,
  ...props 
}: RetroButtonProps) {
  const baseStyles = "retro-btn flex items-center justify-center gap-2 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
    outline: "bg-transparent border-2 border-foreground text-foreground hover:bg-foreground/5",
    ghost: "bg-transparent border-transparent shadow-none hover:bg-black/5 active:translate-y-0 active:translate-x-0 border-none",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  };

  return (
    <button 
      className={cn(baseStyles, variants[variant], className)} 
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}
