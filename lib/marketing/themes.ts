/** Temas rotativos do autopilot de publicidade (puras). */

export interface MarketingTheme {
  key: string;
  label: string;
  audience: string;
  angle: string;
}

export const MARKETING_THEMES: readonly MarketingTheme[] = [
  { key: "infantil", label: "Festa infantil", audience: "mães e pais organizando festa de 1 a 10 anos", angle: "menos correria no dia, mais memória" },
  { key: "casamento", label: "Casamento", audience: "noivos planejando casamento em até 12 meses", angle: "clareza de custo antes de fechar fornecedor" },
  { key: "15-anos", label: "15 anos", audience: "famílias organizando festa de 15 anos", angle: "três caminhos de festa com orçamento explicado" },
  { key: "formatura", label: "Formatura", audience: "formandos e comissões de formatura", angle: "rateio e custo por convidado sem planilha" },
  { key: "corporativo", label: "Corporativo", audience: "RH e organizadores de eventos corporativos", angle: "evento corporativo organizado em três opções" },
];

/** Escolhe o tema da hora (rotação determinística, 1 por hora). */
export function themeForHour(hour: number): MarketingTheme {
  const index = Math.abs(Math.trunc(hour)) % MARKETING_THEMES.length;
  return MARKETING_THEMES[index] ?? MARKETING_THEMES[0];
}
