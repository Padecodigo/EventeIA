import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "gold" | "ghost";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primaria text-white shadow-[0_10px_24px_-12px_rgba(163,72,90,0.7)] hover:bg-primaria-escura",
  secondary: "border border-vinho/15 bg-white text-vinho hover:border-primaria/40 hover:bg-verde-claro/50",
  gold: "bg-champagne text-vinho hover:bg-champagne-claro",
  ghost: "text-primaria underline decoration-primaria/40 underline-offset-4 hover:decoration-champagne-claro",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition duration-editorial ease-editorial disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
