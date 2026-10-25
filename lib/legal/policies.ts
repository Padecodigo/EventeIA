import type { LegalSection } from "@/components/legal/legal-document";

/** Política de Estorno e Disputa de Pagamento (/estorno). */
export const REFUND_SECTIONS: readonly LegalSection[] = [
  {
    id: "abrangencia",
    title: "A quem esta política se aplica",
    paragraphs: [
      "Esta política vale para todas as compras feitas no EventeIA: o ticket avulso (R$ 97, ou R$ 57 com o desconto de boas-vindas) e os pacotes Essencial, Atelier e Maison, além da renovação mensal. Os valores de cada pacote são os informados na página de planos no momento da compra.",
      "O pagamento é feito por Pix ou cartão de crédito, processado pelo Asaas.",
    ],
  },
  {
    id: "arrependimento",
    title: "Direito de arrependimento: até 7 dias",
    paragraphs: [
      "Você pode desistir da compra em até 7 dias corridos após o pagamento, como garante o art. 49 do Código de Defesa do Consumidor. Se a busca de fornecedores ainda não tiver começado, você recebe de volta o valor integral pago.",
    ],
  },
  {
    id: "ticket-nao-usado",
    title: "Ticket comprado e não usado",
    paragraphs: [
      "Se você comprou um ticket (avulso ou de um pacote), não o usou e a busca de fornecedores do evento não começou, você tem direito ao reembolso integral do valor pago por ele.",
    ],
  },
  {
    id: "busca-iniciada",
    title: "Depois que a busca de fornecedores começa",
    paragraphs: [
      "Quando a busca de fornecedores de um evento começa, o serviço passa a ser prestado e gera custos imediatos: pesquisa de fornecedores, uso de inteligência artificial e envio de mensagens por WhatsApp e e-mail. Por isso, a partir desse momento, o ticket usado nesse evento não é reembolsável.",
      "Isso não limita os direitos que a lei garante a você. Se o serviço não for prestado ou tiver falha atribuível ao EventeIA, fale com a gente e analisaremos o caso conforme o Código de Defesa do Consumidor.",
    ],
  },
  {
    id: "como-pedir",
    title: "Como pedir o reembolso",
    items: [
      "Com conta: abra um chamado em “Ajuda e feedback” no painel e acompanhe em “Meus chamados” (/chamados).",
      "Sem acesso à conta: use a página de contato do site (/contato). Respondemos no e-mail informado.",
      "Informe o e-mail da conta, a data da compra e o motivo. Confirmamos o pedido em até 2 dias úteis.",
    ],
  },
  {
    id: "prazos",
    title: "Prazos e forma de devolução",
    paragraphs: [
      "O reembolso é feito pelo mesmo meio de pagamento usado na compra, por meio do Asaas:",
    ],
    items: [
      "Pix: devolução para a conta de origem, normalmente em até 7 dias úteis após a aprovação do pedido.",
      "Cartão de crédito: estorno solicitado à operadora após a aprovação; o crédito aparece em uma das próximas faturas, conforme o prazo do banco emissor.",
      "Os tickets reembolsados são retirados da sua conta.",
    ],
  },
  {
    id: "disputas",
    title: "Disputas de pagamento (chargeback e MED do Pix)",
    paragraphs: [
      "Antes de abrir uma disputa no banco, fale com o nosso suporte: quase sempre resolvemos mais rápido e sem burocracia.",
      "Se for aberta uma contestação no cartão (chargeback) ou um pedido de devolução pelo Mecanismo Especial de Devolução do Pix (MED):",
    ],
    items: [
      "O evento e o serviço ligados ao pagamento ficam suspensos enquanto a disputa estiver aberta.",
      "O EventeIA envia ao Asaas e à instituição financeira as provas da prestação do serviço, como registros de uso da conta e a data e hora do início da busca de fornecedores.",
      "Se a disputa for decidida a seu favor, o valor é devolvido e os tickets correspondentes são retirados da conta.",
      "Se for decidida a favor do EventeIA, o serviço é retomado normalmente.",
      "Disputas abertas de má-fé, depois de usado o serviço, podem levar à suspensão da conta, conforme os Termos de Uso.",
    ],
  },
  {
    id: "relacionados",
    title: "Documentos relacionados",
    paragraphs: [
      "Esta política complementa os Termos de Uso (/termos) e a Política de Privacidade (/privacidade).",
    ],
  },
];

/** Política de Retenção de Dados (/retencao-de-dados). */
export const RETENTION_SECTIONS: readonly LegalSection[] = [
  {
    id: "objetivo",
    title: "Objetivo",
    paragraphs: [
      "Esta política explica por quanto tempo o EventeIA guarda os seus dados e o que acontece depois, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018). Ela complementa a Política de Privacidade (/privacidade).",
    ],
  },
  {
    id: "prazos",
    title: "Prazos de retenção",
    items: [
      "Arquivos e conversas do evento (orçamentos, anexos e mensagens com fornecedores): guardados por 90 dias após a data do evento e, depois disso, anonimizados.",
      "Dados de pagamento e registros fiscais: guardados por 5 anos, para cumprir obrigações fiscais e contábeis.",
      "Dados da conta (nome, e-mail, telefone): enquanto a conta estiver ativa.",
      "Registros de acesso: pelo prazo previsto no Marco Civil da Internet.",
    ],
  },
  {
    id: "anonimizacao",
    title: "O que é anonimização",
    paragraphs: [
      "Anonimizar é retirar dos dados qualquer informação que permita identificar você. Dados anonimizados podem ser usados apenas para estatísticas e melhoria do serviço, sem ligação com a sua pessoa.",
    ],
  },
  {
    id: "direitos",
    title: "Seus direitos",
    items: [
      "Acesso: saber quais dados guardamos e receber uma cópia.",
      "Correção: corrigir dados incompletos, inexatos ou desatualizados.",
      "Eliminação antecipada: pedir a exclusão ou anonimização antes dos prazos acima, salvo os dados que a lei nos obriga a guardar (como registros fiscais).",
      "Os demais direitos do art. 18 da LGPD, descritos na Política de Privacidade.",
    ],
  },
  {
    id: "como-pedir",
    title: "Como exercer os seus direitos",
    paragraphs: [
      "Com conta, abra um chamado em “Ajuda e feedback” e acompanhe em “Meus chamados” (/chamados). Sem conta, use a página de contato do site (/contato). Respondemos no e-mail informado, nos prazos da LGPD.",
    ],
  },
];
