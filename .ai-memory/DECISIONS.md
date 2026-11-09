# Decisões (índice)

Registro legível das decisões de arquitetura/produto. O detalhe fica em `decisions/`
(escrito pelas ferramentas do `ai-memory-mcp`); aqui mantemos o índice curto.

| # | Data | Decisão | Motivo |
|---|---|---|---|
| 001 | 2026-10-27 | Prospecção **inbound-first**: o fornecedor inicia (comentário/DM); o bot nunca manda a 1ª DM | APIs da Meta não permitem DM fria; respeita a janela de 24h e evita banimento |
| 002 | 2026-10-27 | Limites oficiais centralizados em `lib/meta/limits.ts` (Graph API `v26.0`; legenda 2.200/30/20; 100 posts/24h com teto operacional 50; private reply 7 dias; mensagens 24h) | Não presumir valores; a doc muda |
| 003 | 2026-10-27 | ModelsLab SDXL via `POST /api/v6/realtime/text2img`, chave no corpo JSON | Endpoint/auth confirmados na doc oficial |
| 004 | 2026-10-27 | Messenger aceita `supplier_id` nulo (migração 0054) e o agente pede o @ do Instagram | PSID é escopado pela Página; não mapeia para handle público |
| 005 | 2026-10-27 | Migrações **forward-only**, aditivas; nunca `DROP`/`TRUNCATE`/`DELETE` sem `WHERE` | AGENTS.md §3 |
| 006 | 2026-10-28 | Tools do agente (**CodeGraph** + **ai-memory**) via MCP em `.cursor/mcp.json`, regras em `AGENTS.md` + `.context/AGENT_TOOLING.md` | Projeto usa orientação centralizada (não separação por agentes) |
| 007 | 2026-11-07 | Merge de PR só junto com deploy do app **e** do worker | Mergear sem deploy deixa `main` à frente da produção e torna o SHA implantado ambíguo |
| 008 | 2026-11-07 | Impressão do orçamento é documento, não tela: layout do painel sai via `print:hidden` e a paleta clara é forçada | O PDF herdava header, banners e rodapé; tema escuro virava papel preto |
| 009 | 2026-11-07 | Produto passa a ter **só tíquete por evento** (R$ 97): planos, assinatura, franquia de créditos e `/para-planners` saem da superfície comercial | O diferencial é o orçamento único; planos diluíam a mensagem e criavam dois públicos |
| 010 | 2026-11-07 | **Descrever → pagar → entrevista**: sem tíquete `active` a entrevista não abre e o código `EVT-…` não aparece | O funil precisa começar pelo evento (é o que se cota) e o código confirma um evento que já existe |
| 011 | 2026-11-07 | Cupom **só por campanha sazonal**, teto de **30%**; sorteio automático sai do site | Desconto permanente corrói margem; campanha é controlada e mensurável |
| 012 | 2026-11-07 | Home v2: paleta ameixa/coral, CTA fixo no mobile, CTA sempre `#C24145` | Público é mãe no celular; o coral claro `#E8575A` com branco reprova AA (3,53:1), então só em texto grande/decoração |
| 013 | 2026-11-07 | **TikTok = só publicidade** (iscas via Content Posting API, rascunho manual); **busca de fornecedores só Facebook + Instagram** | Não há API oficial TikTok para busca/descoberta; Research API é acadêmica e scraping viola ToS |
| 014 | 2026-11-08 | **Dois tipos de publicidade**: (1) **diária** (autopilot) respeita identidade visual; (2) **isca** (prospecção por evento) respeita tema do **alvo** + tipo do **evento** + identidade visual (logo) | Logo/selo é identidade; isca precisa da cena do evento (ex.: buffet→comida, casamento→núpcias) |
| 015 | 2026-11-09 | **Arte publicitária = híbrido**: FLUX gera só a **cena** (única, sem texto no prompt), sharp sobrepõe **banner (headline) + cards "Orçamento recebido"** (texto nítido). Modelo NVIDIA trocado para `flux.1-dev` (maior que o klein); semente aleatória por chamada (`randomSeed`). | FLUX puro renderizando texto dava 500/parecia artificial; foto real repetia (1 foto/tema) e o `letter-spacing` do SVG causava "texto atrás de texto" |
| 016 | 2026-11-09 | **Autopilot de publicidade removido**: o cron/worker, a página admin, os módulos e os testes saem; a única publicação automática é a **isca** da prospecção. A flag `marketing_autopilot` é desativada pela migração `0088` (sem `DROP`). | A publicação de anúncios não deve mais produzir posts; a isca segue com tema do evento, sem pessoas e com cena estática. |
