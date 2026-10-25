"use client";

import Link from "next/link";

import { TERMS_FIELD } from "@/lib/legal/terms";

export interface TermsCheckboxProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Associa a checkbox a um <form> externo (atributo form). */
  form?: string;
  className?: string;
}

/** Checkbox obrigatória de aceite dos Termos de Uso e da Política de Privacidade. */
export function TermsCheckbox({ id, checked, onChange, form, className }: TermsCheckboxProps) {
  return (
    <div className={`flex items-start gap-2 text-sm text-vinho/80 ${className ?? ""}`}>
      <input
        id={id}
        type="checkbox"
        name={TERMS_FIELD}
        form={form}
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-vinho"
      />
      <label htmlFor={id}>
        Li e aceito os{" "}
        <Link
          href="/termos"
          target="_blank"
          className="font-medium text-vinho underline decoration-champagne underline-offset-4"
        >
          Termos de Uso
        </Link>{" "}
        e a{" "}
        <Link
          href="/privacidade"
          target="_blank"
          className="font-medium text-vinho underline decoration-champagne underline-offset-4"
        >
          Política de Privacidade
        </Link>
        .
      </label>
    </div>
  );
}
