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
      q: "Atende minha cidade?",
      a: "Sim. Você informa a cidade do seu evento e a EventeIA busca fornecedores da sua região. Dependendo da cidade, a quantidade de fornecedores encontrados pode variar.",
    },
    {
      q: "Como a EventeIA encontra os fornecedores?",
      a: "Buscamos fornecedores da sua região para o seu tipo de evento, pedimos os orçamentos por você e comparamos tudo para entregar um orçamento pronto.",
    },
    {
      q: "Quanto custa um orçamento de festa pela EventeIA?",
      a: `Um ticket de ${formatBRL(ticketPriceCents)} por evento, pagamento único. Você rascunha o evento de graça e só paga para ativar.`,
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
