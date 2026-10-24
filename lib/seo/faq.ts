import { formatBRL } from "@/lib/money";

export interface FaqItem {
  q: string;
  a: string;
}

/** FAQ pública (renderizada no servidor e espelhada em JSON-LD FAQPage). */
export function buildFaq(ticketPriceCents: number): FaqItem[] {
  return [
    {
      q: "Para quais eventos a EventeIA funciona?",
      a: "Para todos: festa infantil, aniversário, 15 anos, formatura, casamento, evento corporativo, chá de bebê, batizado e outras celebrações.",
    },
    {
      q: "A EventeIA atende São José dos Campos, Taubaté e o Vale do Paraíba?",
      a: "Sim. Buscamos fornecedores em São José dos Campos, Taubaté, Jacareí, Caçapava, Pindamonhangaba, Guaratinguetá e demais cidades do Vale do Paraíba.",
    },
    {
      q: "Como os fornecedores são contatados?",
      a: "Pelo WhatsApp que você conecta ao iniciar a busca. As mensagens saem com intervalo, o fornecedor pode pedir para não receber mais e, ao final da busca, a conexão é encerrada por segurança.",
    },
    {
      q: "Quanto custa um orçamento de festa pela EventeIA?",
      a: `Para quem organiza o próprio evento, um ticket avulso de ${formatBRL(ticketPriceCents)} por evento, sem mensalidade. Cerimonialistas e planners têm planos mensais com créditos.`,
    },
    {
      q: "Sou obrigado a fechar com algum fornecedor?",
      a: "Não. A EventeIA organiza e compara as propostas; quem decide e negocia é você.",
    },
    {
      q: "Como funciona o pagamento?",
      a: "Pix seguro ou cartão. Você recebe a confirmação na hora em que o pagamento é aprovado.",
    },
  ];
}
