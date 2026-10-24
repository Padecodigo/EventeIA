import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "gold" | "ghost";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-vinho text-off-white hover:bg-vinho/90",
  secondary: "border border-champagne text-vinho hover:bg-champagne-claro/40",
  gold: "bg-champagne text-vinho hover:bg-champagne-claro",
  ghost: "text-vinho underline decoration-champagne underline-offset-4 hover:decoration-champagne-claro",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition duration-editorial ease-editorial disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
