import type { LegalSection } from "@/components/legal/legal-document";

/** Textos dos Termos de Uso e da Política de Privacidade (versão TERMS_VERSION). */

export const PRIVACY_SECTIONS: readonly LegalSection[] = [
  {
    id: "o-que-fazemos",
    title: "O que o EventeIA faz",
    paragraphs: [
      "Você descreve o seu evento (tipo, data, cidade, número de convidados e o que precisa). O EventeIA busca fornecedores compatíveis, pede orçamentos a eles por WhatsApp e e-mail em dias úteis, das 9h às 18h, e organiza as respostas para você comparar.",
      "O serviço é vendido por créditos, avulsos ou em pacotes. Os créditos não vencem. Há também a opção de renovação mensal. O pagamento é feito por Pix ou cartão de crédito, processado pelo Asaas.",
    ],
  },
  {
    id: "dados-coletados",
    title: "Quais dados coletamos",
    items: [
      "Usuários e interessados (leads): nome, e-mail, telefone e os dados do evento que você informa.",
      "Pagamentos: CPF e dados da cobrança, processados pelo Asaas. O EventeIA não guarda o número do seu cartão.",
      "Dados técnicos e cookies: informações de acesso, do navegador e do aparelho, e cookies necessários para login, segurança e funcionamento do site.",
      "Fornecedores: informações comerciais públicas, como nome do negócio, categoria, cidade, telefone e e-mail comerciais.",
    ],
  },
  {
    id: "uso-e-base-legal",
    title: "Como usamos os dados e a base legal (LGPD)",
    items: [
      "Execução de contrato: criar e manter a sua conta, buscar fornecedores, pedir e organizar orçamentos, processar pagamentos e liberar créditos.",
      "Legítimo interesse: contato comercial com fornecedores para pedir orçamentos, prevenção de fraudes e melhoria do serviço.",
      "Consentimento, quando aplicável: por exemplo, para receber mensagens que dependam da sua autorização. Você pode retirar o consentimento a qualquer momento.",
      "Obrigação legal e fiscal: guardar registros de pagamentos e cumprir exigências de autoridades.",
    ],
  },
  {
    id: "compartilhamento",
    title: "Com quem compartilhamos",
    paragraphs: [
      "Compartilhamos dados apenas com os parceiros necessários para o serviço funcionar:",
    ],
    items: [
      "Asaas: processamento de pagamentos (Pix e cartão).",
      "OpenStreetMap, Serper e Google Places: busca de fornecedores.",
      "DeepSeek: organização das informações e das respostas com inteligência artificial.",
      "Resend: envio de e-mails.",
      "WhatsApp: envio e recebimento de mensagens com fornecedores e com você.",
      "Supabase: hospedagem do banco de dados e autenticação.",
      "Google: login com conta Google, quando você escolhe essa opção.",
      "Fornecedores: os dados do evento necessários para que eles enviem o orçamento.",
    ],
  },
  {
    id: "direitos",
    title: "Seus direitos (art. 18 da LGPD)",
    paragraphs: ["Você pode, a qualquer momento, pedir:"],
    items: [
      "Confirmação de que tratamos os seus dados e acesso a eles.",
      "Correção de dados incompletos, inexatos ou desatualizados.",
      "Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a LGPD.",
      "Portabilidade dos dados a outro fornecedor de serviço.",
      "Eliminação dos dados tratados com base no consentimento.",
      "Informação sobre com quem compartilhamos os seus dados.",
      "Informação sobre a possibilidade de não dar consentimento e as consequências disso.",
      "Revogação do consentimento.",
      "Para exercer qualquer um desses direitos, use a página de contato do site (/contato). Respondemos no e-mail informado.",
    ],
  },
  {
    id: "retencao",
    title: "Por quanto tempo guardamos",
    items: [
      "Dados da conta e dos eventos: enquanto a conta estiver ativa ou enquanto forem necessários para prestar o serviço.",
      "Registros de pagamento: pelo prazo exigido pela legislação fiscal e contábil.",
      "Registros de acesso: pelo prazo previsto no Marco Civil da Internet.",
      "Dados de fornecedores: enquanto forem úteis para pedir orçamentos, ou até o fornecedor pedir a exclusão.",
      "Depois desses prazos, os dados são eliminados ou anonimizados.",
    ],
  },
  {
    id: "seguranca",
    title: "Segurança",
    paragraphs: [
      "Usamos medidas técnicas e administrativas para proteger os dados, como conexão criptografada (HTTPS), controle de acesso por usuário no banco de dados e acesso restrito às chaves dos sistemas. Nenhum sistema é 100% imune, mas avisaremos você e as autoridades em caso de incidente relevante, como manda a LGPD.",
    ],
  },
  {
    id: "alteracoes",
    title: "Alterações desta política",
    paragraphs: [
      "Podemos atualizar esta política. A versão vigente fica sempre nesta página, com a data de vigência no topo. Mudanças importantes serão avisadas no site ou por e-mail, e poderemos pedir um novo aceite.",
      "Esta versão vale a partir de 25/10/2026.",
    ],
  },
];

export const TERMS_SECTIONS: readonly LegalSection[] = [
  {
    id: "servico",
    title: "O serviço",
    paragraphs: [
      "O EventeIA ajuda você a orçar o seu evento: você descreve o que precisa, o sistema busca fornecedores, pede orçamentos por WhatsApp e e-mail em dias úteis, das 9h às 18h, e organiza as respostas para comparação.",
      "Ao criar uma conta ou comprar créditos, você declara que leu e aceita estes Termos e a Política de Privacidade.",
    ],
  },
  {
    id: "conta",
    title: "Sua conta",
    items: [
      "Informe dados verdadeiros e mantenha-os atualizados.",
      "Você é responsável pela sua senha e pelo que é feito na sua conta.",
      "Você pode entrar com e-mail e senha ou com a sua conta Google.",
    ],
  },
  {
    id: "uso-aceitavel",
    title: "Uso aceitável",
    paragraphs: ["Não é permitido usar o EventeIA para:"],
    items: [
      "Informar dados falsos ou de outra pessoa sem autorização.",
      "Enviar conteúdo ilegal, ofensivo, discriminatório ou spam aos fornecedores.",
      "Tentar acessar dados de outros usuários, burlar limites técnicos ou atacar o sistema.",
      "Copiar, revender ou automatizar o serviço sem autorização.",
      "Podemos suspender ou encerrar contas que descumprirem estas regras.",
    ],
  },
  {
    id: "creditos-pagamentos",
    title: "Créditos e pagamentos",
    items: [
      "O serviço é vendido por créditos: avulsos ou em pacotes. Cada crédito libera um evento.",
      "Os créditos não vencem.",
      "Há a opção de renovação mensal: os créditos do plano entram a cada pagamento confirmado. Você pode cancelar a renovação quando quiser na página de créditos; os créditos já recebidos continuam com você.",
      "O pagamento é feito por Pix ou cartão de crédito, processado pelo Asaas. Os créditos são liberados após a confirmação do pagamento.",
      "Cupons e ofertas seguem as condições informadas no momento da compra e não se acumulam.",
    ],
  },
  {
    id: "reembolso",
    title: "Arrependimento e reembolso",
    paragraphs: [
      "Você pode desistir da compra em até 7 dias corridos após o pagamento (direito de arrependimento do Código de Defesa do Consumidor, art. 49) e receber o reembolso dos créditos ainda não usados. Créditos já usados para iniciar a busca de um evento não são reembolsáveis, porque o serviço já foi prestado.",
      "Para pedir, use a página de contato. O reembolso é feito pelo mesmo meio de pagamento, via Asaas.",
    ],
  },
  {
    id: "responsabilidade",
    title: "Limites de responsabilidade",
    items: [
      "O EventeIA intermedeia o contato e organiza os orçamentos. O EventeIA não é parte do contrato entre você e o fornecedor.",
      "Preços, disponibilidade, qualidade, prazos e a execução do serviço são de responsabilidade do fornecedor que você escolher.",
      "Não garantimos que todos os fornecedores respondam nem que respondam em um prazo específico.",
      "As estimativas e a organização feitas pelo sistema (inclusive com inteligência artificial) ajudam na decisão, mas a decisão final é sua. Confira os dados com o fornecedor antes de fechar.",
      "Nada nestes Termos limita os direitos que o Código de Defesa do Consumidor garante a você.",
    ],
  },
  {
    id: "privacidade",
    title: "Privacidade",
    paragraphs: [
      "O uso dos seus dados segue a nossa Política de Privacidade, disponível em /privacidade.",
    ],
  },
  {
    id: "alteracoes",
    title: "Alterações dos termos",
    paragraphs: [
      "Podemos atualizar estes Termos. A versão vigente fica sempre nesta página, com a data de vigência no topo. Mudanças importantes serão avisadas, e poderemos pedir um novo aceite.",
    ],
  },
  {
    id: "foro",
    title: "Lei aplicável e foro",
    paragraphs: [
      "Estes Termos seguem as leis do Brasil. Fica eleito o foro do domicílio do consumidor para resolver qualquer questão, como garante o Código de Defesa do Consumidor.",
      "Contato: use a página /contato.",
    ],
  },
];
