import type { EngineParams } from "../types";

/**
 * Parâmetros do motor financeiro — versão 1.1.0.
 *
 * ⚠️ Valores ILUSTRATIVOS de referência para o scaffold. A calibração real
 * (pesquisa de fornecedores locais) deve gerar uma nova versão (v2) e bump
 * de ENGINE_VERSION — nunca alterar v1 em produção (ARCHITECTURE.md §5.2).
 *
 * Fatores em partes por milhar (ppm): 1000 = neutro.
 */
export const ENGINE_PARAMS_V1: EngineParams = {
  version: "1.1.0",

  regionFactorPpm: {
    sp: 1100,
    rj: 1050,
    mg: 950,
    outros: 1000,
  },

  eventTypeFactorPpm: {
    festa_infantil: 900,
    quinze_anos: 1050,
    casamento: 1100,
    aniversario: 950,
    corporativo: 1000,
    batizado: 900,
    formatura: 1050,
  },

  urgencyDays: 30,
  urgencyFactorPpm: 1120,

  // jan · fev · mar · abr · mai · jun · jul · ago · set · out · nov · dez
  monthFactorPpm: [950, 1000, 1020, 1030, 1080, 1030, 1020, 1030, 1050, 1080, 1100, 1150],

  items: {
    buffet: { label: "Buffet", fixedCents: 0, perGuestCents: 12_000 },
    decoracao: { label: "Decoração", fixedCents: 350_000, perGuestCents: 2_500 },
    musica: { label: "Música", fixedCents: 250_000, perGuestCents: 0 },
    fotografia: { label: "Fotografia", fixedCents: 280_000, perGuestCents: 0 },
    espaco: { label: "Espaço", fixedCents: 0, perGuestCents: 8_000 },
  },

  minFactorPpm: 850,
  maxFactorPpm: 1250,
};
