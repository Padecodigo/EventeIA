"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface Municipio {
  code: number;
  name: string;
  uf: string;
}

/**
 * Autocomplete de municípios (todos os ~5.570 do IBGE, busca sem acento em /api/municipios).
 * Envia `cityCode` (código IBGE) no formulário; o servidor resolve nome e UF.
 */
export function CityPicker({
  name = "cityCode",
  label = "Cidade do evento",
  initial = null,
  onChange,
  required = true,
  clearOnSelect = false,
  placeholder = "Digite a cidade",
}: {
  /** Nome do input hidden com o código IBGE; "" ⇒ sem input (o pai controla via onChange). */
  name?: string;
  label?: string;
  /** Município pré-selecionado (ex.: cidade do evento). */
  initial?: Municipio | null;
  onChange?: (m: Municipio | null) => void;
  required?: boolean;
  /** Modo "adicionar" (multi-seleção): limpa o campo após escolher. */
  clearOnSelect?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState(initial === null ? "" : `${initial.name} – ${initial.uf}`);
  const [results, setResults] = useState<Municipio[]>([]);
  const [selected, setSelected] = useState<Municipio | null>(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (selected !== null || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      fetch(`/api/municipios?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ results: Municipio[] }>) : { results: [] }))
        .then((d) => {
          setResults(d.results);
          setActive(0);
          setOpen(true);
        })
        .catch(() => undefined);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, selected]);

  function choose(m: Municipio) {
    setOpen(false);
    onChange?.(m);
    if (clearOnSelect) {
      setSelected(null);
      setQuery("");
      setResults([]);
      return;
    }
    setSelected(m);
    setQuery(`${m.name} – ${m.uf}`);
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-vinho">
        {label}
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        required={required}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          if (selected !== null) onChange?.(null);
          setSelected(null);
          setQuery(e.target.value);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const m = results[active];
            if (m !== undefined) choose(m);
          }
        }}
        className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho placeholder:text-vinho/70"
      />
      {name !== "" ? <input type="hidden" name={name} value={selected?.code ?? ""} /> : null}
      {open && results.length > 0 ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line-subtle bg-white shadow-soft"
        >
          {results.map((m, i) => (
            <li
              key={m.code}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(m);
              }}
              className={`cursor-pointer px-4 py-2 text-sm text-vinho ${i === active ? "bg-areia-secundaria/60" : ""}`}
            >
              {m.name} <span className="text-vinho/60">– {m.uf}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {!clearOnSelect && query.trim().length >= 2 && selected === null && !open ? (
        <p className="text-caption text-vinho/70">Escolha uma cidade da lista.</p>
      ) : null}
    </div>
  );
}
