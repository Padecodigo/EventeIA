/** Temas rotativos do autopilot de publicidade (puras). */

export interface MarketingTheme {
  key: string;
  label: string;
  audience: string;
  angle: string;
}

export const MARKETING_THEMES: readonly MarketingTheme[] = [
  { key: "infantil", label: "Festa infantil", audience: "mães e pais organizando festa de 1 a 10 anos", angle: "menos correria no dia, mais memória" },
  { key: "aniversario", label: "Aniversário", audience: "quem organiza aniversário de qualquer idade", angle: "uma festa bonita sem passar o dia resolvendo problema" },
  { key: "casamento", label: "Casamento", audience: "noivos planejando casamento em até 12 meses", angle: "clareza de custo antes de fechar fornecedor" },
  { key: "15-anos", label: "15 anos", audience: "famílias organizando festa de 15 anos", angle: "um caminho de festa com orçamento explicado" },
  { key: "formatura", label: "Formatura", audience: "formandos e comissões de formatura", angle: "rateio e custo por convidado sem planilha" },
  { key: "corporativo", label: "Corporativo", audience: "RH e organizadores de eventos corporativos", angle: "evento corporativo com orçamento único no menor preço válido" },
];

/**
 * Escolhe o tema por bloco de 4 horas (0,4,8,12,16,20 → 6 postagens/dia).
 * `dayOffset` (dia do calendário) embaralha a ordem entre os dias sem repetir
 * imagem dentro do mesmo dia. Determinístico.
 */
export function themeForHour(hour: number, dayOffset = 0): MarketingTheme {
  const slot = Math.floor(Math.abs(Math.trunc(hour)) / 4);
  const index = (slot + dayOffset) % MARKETING_THEMES.length;
  return MARKETING_THEMES[index] ?? MARKETING_THEMES[0];
}
