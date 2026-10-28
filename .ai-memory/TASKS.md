# TASKS — handoff do agente

> Atualize ao encerrar a sessão: o que ficou pronto, o que está travado, qual o próximo passo.

## Agora

- [ ] **PR #126** (agente atende DM do Messenger) — código completo e validado localmente
      (`lint`, `typecheck`, 1.162 testes, `build`), **aguardando CI**. O GitHub Actions
      recusa iniciar jobs: *"recent account payments have failed or your spending limit
      needs to be increased"*. Regularizar em **Settings → Billing & plans → Actions**.
- [ ] Após o CI verde: merge do #126 → deploy → verificar `/api/health` e `SOURCE_COMMIT`.

## Pendências conhecidas (fora do #126)

- [ ] **Notificação de escalonamento** por e-mail/Telegram (hoje só marca `awaiting_human` e loga).
      Exige escolher provedor — depende de decisão do dono (AGENTS.md §3.4).
- [ ] **Status do fornecedor** (`novo`, `marcado`, `comentou`, `respondeu`, `cotou`, `descartado`, `opt-out`)
      ainda não modelado como enum; hoje há `opt_out_at` + status de conversa.

## Ambiente

- CodeGraph: `npx -y @sdsrs/code-graph` (índice em `.code-graph/`, fora do Git).
- ai-memory: `npx -y ai-memory-mcp` (raiz `.ai-memory/`).
- Guia: [`.context/AGENT_TOOLING.md`](../.context/AGENT_TOOLING.md).

## Último estado de produção

- Commit `4c1894de68ee` · `/api/health` 200 · webhook Meta 403/401 · `/admin/prospeccao` 307 sem sessão.
