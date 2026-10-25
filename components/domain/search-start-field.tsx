"use client";

import { useState } from "react";

/**
 * "Quando começar a busca de fornecedores?" — padrão: o quanto antes (próximo dia útil).
 * O seletor só ajuda; a regra (dia útil, sem feriado, a partir de hoje, antes do evento)
 * é validada no servidor e no banco.
 */
export function SearchStartField({
  defaultDate = null,
  minDate,
  maxDate,
}: {
  defaultDate?: string | null;
  minDate: string;
  maxDate?: string;
}) {
  const [mode, setMode] = useState<"asap" | "date">(defaultDate === null ? "asap" : "date");
  return (
    <fieldset className="flex flex-col gap-2" data-testid="search-start-field">
      <legend className="text-sm font-medium text-vinho">Quando começar a busca de fornecedores?</legend>
      <label className="flex items-center gap-2 text-sm text-vinho">
        <input type="radio" name="searchStartMode" value="asap" checked={mode === "asap"} onChange={() => setMode("asap")} />
        O quanto antes (próximo dia útil)
      </label>
      <label className="flex items-center gap-2 text-sm text-vinho">
        <input type="radio" name="searchStartMode" value="date" checked={mode === "date"} onChange={() => setMode("date")} />
        Escolher uma data
      </label>
      {mode === "date" ? (
        <input
          type="date"
          name="searchStartDate"
          aria-label="Data para começar a busca"
          required
          min={minDate}
          {...(maxDate !== undefined ? { max: maxDate } : {})}
          defaultValue={defaultDate ?? undefined}
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        />
      ) : null}
      <p className="text-caption text-vinho/70">
        Buscamos e contatamos fornecedores só em dias úteis (seg–sex, sem feriados nacionais), das 9h às 18h.
      </p>
    </fieldset>
  );
}
