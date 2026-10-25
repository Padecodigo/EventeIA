"use client";

import { CityPicker, type Municipio } from "@/components/domain/city-picker";

/** Mesmo teto de MAX_SEARCH_CITIES / CHECK da migração 0034 (inclui a cidade do evento). */
export const MAX_SEARCH_CITIES_UI = 10;

/**
 * Multi-seleção de cidades para buscar fornecedores (mesma busca IBGE do CityPicker).
 * A cidade do evento é sempre incluída e não pode ser removida aqui.
 */
export function SearchCitiesPicker({
  eventCity,
  value,
  onChange,
}: {
  eventCity: Municipio | null;
  value: Municipio[];
  onChange: (next: Municipio[]) => void;
}) {
  const extras = value.filter((m) => m.code !== eventCity?.code);
  const full = (eventCity === null ? 0 : 1) + extras.length >= MAX_SEARCH_CITIES_UI;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-vinho">Cidades para buscar fornecedores</p>
      <ul className="flex flex-wrap gap-2" aria-label="Cidades de busca">
        {eventCity !== null ? (
          <li className="rounded-pill bg-vinho px-3 py-1 text-caption text-white">
            {eventCity.name} – {eventCity.uf} (cidade do evento)
          </li>
        ) : null}
        {extras.map((m) => (
          <li key={m.code} className="flex items-center gap-1 rounded-pill bg-areia-secundaria px-3 py-1 text-caption text-vinho">
            {m.name} – {m.uf}
            <button
              type="button"
              aria-label={`Remover ${m.name}`}
              onClick={() => onChange(extras.filter((x) => x.code !== m.code))}
              className="ml-1 font-semibold"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {full ? (
        <p className="text-caption text-vinho/70">Limite de {MAX_SEARCH_CITIES_UI} cidades atingido.</p>
      ) : (
        <CityPicker
          name=""
          label="Adicionar outra cidade (opcional)"
          placeholder="Ex.: Jacareí"
          required={false}
          clearOnSelect
          onChange={(m) => {
            if (m === null || m.code === eventCity?.code || extras.some((x) => x.code === m.code)) return;
            onChange([...extras, m]);
          }}
        />
      )}
    </div>
  );
}
