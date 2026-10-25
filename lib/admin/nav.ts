/** Seções administrativas (fonte única para os menus de /painel* e /admin*). */
export const ADMIN_NAV = [
  { href: "/admin/financeiro", label: "Financeiro", description: "Receitas, custos e margens." },
  {
    href: "/admin/consumo",
    label: "Consumo",
    description: "Uso de tokens/LLM por usuário e evento.",
  },
  { href: "/admin/depoimentos", label: "Depoimentos", description: "Moderação de depoimentos." },
  { href: "/admin/cupons", label: "Cupons", description: "Criação e gestão de cupons." },
  { href: "/admin/chamados", label: "Chamados", description: "Atendimento e tickets de suporte." },
] as const;

/** Papel com acesso total (superusuário). */
export function isAdminRole(role: unknown): boolean {
  return role === "admin";
}
