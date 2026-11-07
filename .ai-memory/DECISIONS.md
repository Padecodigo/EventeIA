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
