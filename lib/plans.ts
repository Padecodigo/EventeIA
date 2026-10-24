/**
 * Catálogo comercial B2B exibido no site.
 * Fonte da verdade de preços: .context/COMMERCIAL_MODEL.md §3.2.
 * Espelhado em supabase/migrations/0005_plan_pricing.sql e supabase/seed.sql.
 *
 * Regra: todo plano precisa passar em `isPlanViable` (piso de 35%), em Pix e cartão.
 */
export interface PlanDefinition {
  code: string;
  name: string;
  priceCents: number;
  /** Franquia de créditos por ciclo. 1 crédito = 1 evento ativado. */
  credits: number;
  description: string;
  featured: boolean;
}

export interface CreditPackage {
  code: string;
  name: string;
  credits: number;
  priceCents: number;
  description: string;
}

/** Pacotes avulsos (não expiram) — mesma economia dos planos, sem assinatura. */
export const CREDIT_PACKAGES: readonly CreditPackage[] = [
  {
    code: "pacote-3",
    name: "Pacote 3",
    credits: 3,
    priceCents: 11_700,
    description: "Para um mês mais cheio, sem assinatura.",
  },
  {
    code: "pacote-7",
    name: "Pacote 7",
    credits: 7,
    priceCents: 19_700,
    description: "O equilíbrio entre volume e caixa.",
  },
  {
    code: "pacote-17",
    name: "Pacote 17",
    credits: 17,
    priceCents: 39_700,
    description: "Para ateliês com vários clientes.",
  },
];

export const PLANS: readonly PlanDefinition[] = [
  {
    code: "essencial",
    name: "Essencial",
    priceCents: 11_700,
    credits: 3,
    description: "Para quem está começando a organizar festas infantis.",
    featured: false,
  },
  {
    code: "atelier",
    name: "Atelier",
    priceCents: 19_700,
    credits: 7,
    description: "O plano de referência para quem vive de criar festas.",
    featured: true,
  },
  {
    code: "maison",
    name: "Maison",
    priceCents: 39_700,
    credits: 17,
    description: "Para estúdios e cerimonialistas com múltiplos clientes.",
    featured: false,
  },
];
