/** Seções administrativas (fonte única para os menus de /painel* e /admin*). */
export const ADMIN_NAV = [
  { href: "/admin/financeiro", label: "Financeiro", description: "Receitas, custos e margens." },
  { href: "/admin/custos", label: "Custos", description: "Gastos por provedor, saldos e alertas." },
  {
    href: "/admin/consumo",
    label: "Consumo",
    description: "Uso de tokens/LLM por usuário e evento.",
  },
  { href: "/admin/depoimentos", label: "Depoimentos", description: "Moderação de depoimentos." },
  { href: "/admin/cupons", label: "Cupons", description: "Criação e gestão de cupons." },
  { href: "/admin/chamados", label: "Chamados", description: "Atendimento e tickets de suporte." },
  { href: "/admin/eventos", label: "Eventos", description: "Todos os eventos (somente leitura)." },
  { href: "/admin/clientes", label: "Clientes", description: "Contas, eventos e pagamentos (somente leitura)." },
  { href: "/admin/cadastros", label: "Cadastros", description: "Cadastros recentes: seguir de volta no Instagram." },
  { href: "/admin/fornecedores", label: "Fornecedores", description: "Fornecedores encontrados (somente leitura)." },
  { href: "/admin/prospeccao", label: "Prospecção", description: "Posts de isca: aprovar e publicar no Instagram." },
  { href: "/admin/instagram", label: "Instagram", description: "Sessão do navegador: logar, deslogar e trocar conta." },
  { href: "/admin/metricas", label: "Métricas", description: "Acessos, logins e cadastros do site." },
  { href: "/admin/marketing", label: "Publicações", description: "Autopilot de publicidade: ligar/desligar e temas." },
  { href: "/admin/lixeira", label: "Lixeira", description: "Itens excluídos: ver e restaurar." },
  { href: "/admin/busca", label: "Busca", description: "Busca geral: clientes, eventos, chamados e fornecedores." },
] as const;

/** Papel com acesso total (superusuário). */
export function isAdminRole(role: unknown): boolean {
  return role === "admin";
}
