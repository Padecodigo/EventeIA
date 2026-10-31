# Checklist de produção (VPS) — EventeIA

## 1. Chaves reais (nunca no git; só no .env da VPS)
- [ ] Asaas produção: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` (forte), ambiente = produção, webhook cadastrado no painel.
- [ ] DeepSeek (extração de cotações): chave + limite de gasto.
- [ ] Meta: `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_INSTAGRAM_BUSINESS_ID`.
- [ ] xAI: `XAI_API_KEY` com créditos e limite mensal; `XAI_DAILY_BUDGET`, `XAI_USAGE_SWITCH_PCT=25`.
- [ ] NVIDIA NIM (fallback): `NVIDIA_NIM_API_KEY`, `NIM_MODEL`.
- [ ] `DISCOVERY_INGEST_SECRET` (>= 32 chars), `DISCOVERY_DRY_RUN=false` só após homologação.
- [ ] Remover/desativar rotas e segredos de demo (`/demo/entrar`, `dev-demo-*`, pagamento simulado).

## 2. Revisão de segurança
- [ ] Dados pessoais: telefones de fornecedores/usuários só via service role; RLS revisada (suppliers só admin).
- [ ] Logs sem PII (telefone/e-mail mascarados) — revisar pino em produção.
- [ ] Pagamentos: valores em centavos, idempotência do webhook (pgTAP ok), conciliação diária ativa.
- [ ] Assinaturas de webhook: Asaas e Meta com token em tempo constante; ingest com segredo.
- [ ] Rate limit no Nginx/Caddy para /api/webhooks e /api/internal.
- [ ] Rotacionar as chaves usadas em desenvolvimento (xAI e NIM foram coladas no chat).

## 3. Conteúdo
- [ ] Substituir depoimentos de exemplo por reais (com consentimento) ou ocultar a seção.

## 4. Fases do produto
- [x] Fase 1 — entrevista determinística (PR #9, mergeado).
- [ ] Fase 2 — descoberta automática (PR aberto, aguardando revisão).
- [ ] Fase 3 — mapeamento das respostas/cotações recebidas por categoria.
- [ ] Fase 4 — 3 orçamentos (custo-benefício, mais barato, mais prático) + notificação.
- [ ] Fase 5 — PDF/download e histórico no dashboard.
- [ ] Janela de coleta: 5 cotações/categoria ou 24h; entrega as cotações ao final.

## 5. Infraestrutura
- [ ] Docker Compose: app (next start), workers, Redis; restart=always; limites de memória.
- [ ] Redis com senha, sem porta pública, AOF ligado (filas BullMQ).
- [ ] Supabase: cloud (recomendado: backups/PITR gerenciados) vs self-hosted (exige backup próprio). Aplicar migrações 0001–0016 via `supabase db push`.
- [ ] Backups diários do Postgres + teste de restauração.
- [ ] HTTPS (Caddy/Let's Encrypt), HSTS, domínio.
- [ ] Monitoramento: uptime, logs centralizados, alerta de fila parada e de erro de webhook; Sentry opcional.
- [ ] CI verde (correção do pnpm na Fase 2) antes do deploy.

## 6. LGPD e termos
- [ ] Política de privacidade (dados coletados, base legal, contato de fornecedores obtido em fontes públicas, opt-out, retenção).
- [ ] Termos de uso (responsabilidade sobre o contato com fornecedores, limites de envio).
- [ ] Canal do encarregado (DPO) e processo de exclusão a pedido.
