import type { InputHTMLAttributes } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function Field({ label, hint, className = "", id, ...props }: FieldProps) {
  const inputId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-vinho">
        {label}
      </label>
      <input
        id={inputId}
        className={`h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho placeholder:text-vinho/70 focus:border-champagne ${className}`}
        {...props}
      />
      {hint !== undefined ? <p className="text-caption text-vinho/70">{hint}</p> : null}
    </div>
  );
}
