"use client";

import { useEffect, useId, useRef, useState } from "react";

interface Municipio {
  code: number;
  name: string;
  uf: string;
}

/**
 * Autocomplete de municípios (todos os ~5.570 do IBGE, busca sem acento em /api/municipios).
 * Envia `cityCode` (código IBGE) no formulário; o servidor resolve nome e UF.
 */
export function CityPicker({ name = "cityCode", label = "Cidade do evento" }: { name?: string; label?: string }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Municipio[]>([]);
  const [selected, setSelected] = useState<Municipio | null>(null);
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
    setSelected(m);
    setQuery(`${m.name} – ${m.uf}`);
    setOpen(false);
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
        required
        value={query}
        placeholder="Digite a cidade"
        onChange={(e) => {
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
      <input type="hidden" name={name} value={selected?.code ?? ""} />
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
      {query.trim().length >= 2 && selected === null && !open ? (
        <p className="text-caption text-vinho/70">Escolha uma cidade da lista.</p>
      ) : null}
    </div>
  );
}
