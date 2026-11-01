import type { CategoryCode } from "@/lib/catalog/v1";
import { normalizeCategoryCode } from "@/lib/catalog/v1";
import type { ScopeItem } from "@/lib/quotes/scope-items";

/**
 * Categoria → itens que o agente precisa confirmar se estão no preço.
 * Nada aqui é presumido incluso: o que não for confirmado fica "unknown".
 */
const COVERAGE_MAP: Partial<Record<CategoryCode, readonly ScopeItem[]>> = {
  buffet: ["comida", "bebidas", "louca_talheres", "garcons", "toalhas", "mesas_cadeiras", "limpeza", "montagem_desmontagem"],
  espaco: ["mesas_cadeiras", "limpeza", "seguranca", "estacionamento", "cozinha", "som"],
  bebidas: ["barman", "louca_talheres", "frete_entrega", "recolhimento"],
  bolo_doces: ["frete_entrega", "montagem_desmontagem"],
  decoracao: ["montagem_desmontagem", "frete_entrega", "recolhimento", "iluminacao"],
  som_dj: ["iluminacao", "montagem_desmontagem", "frete_entrega"],
  banda: ["som", "montagem_desmontagem"],
  mobiliario: ["frete_entrega", "montagem_desmontagem", "recolhimento", "toalhas"],
  louca: ["frete_entrega", "recolhimento", "lavagem_louca"],
  barman: ["bebidas", "louca_talheres"],
  iluminacao: ["montagem_desmontagem", "gerador"],
};

/** Itens a confirmar para a categoria (texto livre tolerado). Vazio se não mapeada. */
export function expectedCoverageItems(category: string): readonly ScopeItem[] {
  const code = normalizeCategoryCode(category);
  return code === null ? [] : (COVERAGE_MAP[code] ?? []);
}
