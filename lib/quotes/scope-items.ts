/**
 * Itens de escopo de uma oferta: o que pode ou não estar incluso no preço.
 * `covers` liga o item a uma categoria do catálogo quando ele substitui a
 * contratação separada daquela categoria (ex.: buffet com garçons ⇒ cobre "garcons").
 */

import type { CategoryCode } from "@/lib/catalog/v1";

export const SCOPE_ITEMS = [
  "comida",
  "bebidas",
  "mao_de_obra",
  "garcons",
  "louca_talheres",
  "lavagem_louca",
  "toalhas",
  "mesas_cadeiras",
  "limpeza",
  "seguranca",
  "som",
  "iluminacao",
  "decoracao",
  "bolo_doces",
  "gerador",
  "frete_entrega",
  "recolhimento",
  "montagem_desmontagem",
  "transporte_convidados",
  "cozinha",
  "estacionamento",
  "outro",
] as const;

export type ScopeItem = (typeof SCOPE_ITEMS)[number];

export const SCOPE_LABELS: Record<ScopeItem, string> = {
  comida: "comida",
  bebidas: "bebidas",
  mao_de_obra: "mão de obra",
  garcons: "garçons e copeiras",
  louca_talheres: "louça e talheres",
  lavagem_louca: "lavagem da louça",
  toalhas: "toalhas",
  mesas_cadeiras: "mesas e cadeiras",
  limpeza: "limpeza",
  seguranca: "segurança",
  som: "som",
  iluminacao: "iluminação",
  decoracao: "decoração",
  bolo_doces: "bolo e doces",
  gerador: "gerador",
  frete_entrega: "frete / entrega",
  recolhimento: "recolhimento",
  montagem_desmontagem: "montagem e desmontagem",
  transporte_convidados: "transporte de convidados",
  cozinha: "cozinha",
  estacionamento: "estacionamento",
  outro: "outro",
};

/** Item de escopo → categoria que ele dispensa contratar à parte. */
export const SCOPE_COVERS: Partial<Record<ScopeItem, CategoryCode>> = {
  comida: "buffet",
  bebidas: "bebidas",
  garcons: "garcons",
  louca_talheres: "louca",
  mesas_cadeiras: "mobiliario",
  limpeza: "limpeza",
  seguranca: "seguranca",
  som: "som_dj",
  iluminacao: "iluminacao",
  decoracao: "decoracao",
  bolo_doces: "bolo_doces",
  gerador: "gerador",
  transporte_convidados: "transporte",
};

/** Mapeia texto livre do modelo para um item conhecido (tolerante a acentos/sinônimos). */
export function normalizeScopeItem(raw: string): ScopeItem {
  const t = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  if ((SCOPE_ITEMS as readonly string[]).includes(t)) return t as ScopeItem;
  const rules: [RegExp, ScopeItem][] = [
    [/lava/, "lavagem_louca"],
    [/louca|talher|prato|copo/, "louca_talheres"],
    [/garc|copeir|atendent/, "garcons"],
    [/mao_de_obra|equipe|staff|funcionari|cozinheir/, "mao_de_obra"],
    [/mesa|cadeira/, "mesas_cadeiras"],
    [/toalha/, "toalhas"],
    [/limp/, "limpeza"],
    [/segur|portari/, "seguranca"],
    [/frete|entrega/, "frete_entrega"],
    [/recolh|retirad/, "recolhimento"],
    [/montag|desmont|instala/, "montagem_desmontagem"],
    [/transporte|van|onibus/, "transporte_convidados"],
    [/som|caixa/, "som"],
    [/luz|ilumin/, "iluminacao"],
    [/decor|flor/, "decoracao"],
    [/bolo|doce/, "bolo_doces"],
    [/gerador/, "gerador"],
    [/bebida|refri|cerveja|drink/, "bebidas"],
    [/comida|cardapio|aliment|salgad|jantar/, "comida"],
    [/cozinha/, "cozinha"],
    [/estaciona/, "estacionamento"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? "outro";
}
