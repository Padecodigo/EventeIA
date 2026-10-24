# SECURITY.md — Proteção de Dados, Sanitização (SAN) e Mitigação de Vulnerabilidades

> **Fonte da verdade de segurança.** Última revisão: 2026-10-22.
> Irmãos: [AGENTS.md](../AGENTS.md) · [DATABASE_RLS.md](DATABASE_RLS.md) · [PAYMENTS.md](PAYMENTS.md) · [FEEDS.md](FEEDS.md).

---

## 1. Princípios

1. **Least privilege** — cada credencial faz o mínimo necessário (anon < authenticated < service_role).
2. **Default deny** — RLS sem política = sem acesso; CORS fechado; webhooks autenticados.
3. **Defesa em profundidade** — RLS + validação + headers + rate limit; nenhuma camada única é confiável.
4. **Falhar fechado** — erro de validação/autenticação nunca degrada para acesso. Em dúvida: negar e logar.
5. **Segredos nunca em texto plano** no repositório, no client ou em logs.

---

## 2. Modelo de ameaças (resumo) × OWASP Top 10

| Vetor | Risco | Controle |
|---|---|---|
| A01 Broken Access Control | Acesso a eventos/pagamentos de terceiros | RLS forçada + testes pgTAP + posse verificada em toda action |
| A02 Cryptographic Failures | Vazamento de CPF/dados de pagamento | TLS 1.2+, dados sensíveis criptografados/mascarados, sem PAN de cartão no nosso banco |
| A03 Injection | SQL/XSS/HTML malicioso | PostgREST parametrizado, React escaping, `react/no-danger` no lint, zod |
| A04 Insecure Design | Concessão de crédito errada | Regras em ledger + transações + testes de concorrência |
| A05 Security Misconfiguration | Buckets abertos, RLS desligada | IaC revisado, checklist §11, alerta de drift |
| A06 Vulnerable Components | Dependência com CVE | `pnpm audit` no CI (high/critical), Dependabot, lockfile |
| A07 Auth Failures | Sessão sequestrada | Supabase Auth (JWT curto, refresh rotativo), cookies HttpOnly/Secure |
| A08 Integrity Failures | Webhook forjado | Token em tempo constante + idempotência + IP allowlist |
| A09 Logging Failures | Incidente invisível | Feeds + pino + alertas; nunca logar PII/segredos |
| A10 SSRF | URL externa manipulada | Nenhuma URL fornecida pelo usuário é buscada pelo servidor |

---

## 3. Proteção de dados (LGPD — Lei nº 13.709/2018)

- **Classificação**: público (marketing) · interno · pessoal (nome, e-mail, telefone, CPF) · sensível (nenhum previsto hoje — documento fiscal não é "sensível" pela lei, mas é tratado como restrito).
- **Minimização**: coletar só o necessário (nome, e-mail, telefone p/ WhatsApp, CPF/CNPJ para cobrança).
- **Bases legais**: execução de contrato (operação), consentimento (WhatsApp/opt-in), obrigação legal (fiscal).
- **Direitos do titular**: acesso/correção (self-service), exclusão (fluxo `admin.erasure_executed`), portabilidade (export CSV/JSON).
- **Retenção**: operacionais 180 dias; financeiros 5 anos anonimizados; consentimentos enquanto vigentes (ver [FEEDS.md](FEEDS.md) §5).
- **Encarregado (DPO)**: contato publicado em `/privacidade`; canal `privacidade@eventeia.com`.
- **Transferência internacional**: Supabase/Asaas podem processar fora do BR — documentar no aviso de privacidade.

---

## 4. SAN — Sanitização e validação de entradas

> **SAN** cobre a sanitização/validação de todas as entradas (formulários, query strings, webhooks, jobs, variáveis de template) — e, no nível de transporte, a exigência de **SAN (Subject Alternative Names)** nos certificados TLS (§6.3).

1. **Toda fronteira valida com zod**, sem exceção: Server Actions, Route Handlers, webhooks, payload de job, variáveis de template WhatsApp.
2. **Nunca confie no client**: valores monetários, `event_id`, `user_id`, `role`, `status` — sempre derivados/reconferidos no servidor.
3. **React escapa por padrão**; `dangerouslySetInnerHTML` é proibido pelo lint (`react/no-danger`). Se inevitável (ex.: conteúdo editorial rico), sanitizar com DOMPurify **no servidor** e justificar no PR.
4. **SQL**: sempre via PostgREST/SDK tipado; queries cruas apenas em funções `security definer` revisadas.
5. **Uploads**: apenas imagens (PNG/JPEG/WebP), limite 5 MB, nome sanitizado, servidos com `Content-Disposition` e sem execução.
6. **Headers de redirect**: nunca redirecionar para URL fornecida sem allowlist de domínio.
7. **Templates WhatsApp**: interpolação server-side com escape; variáveis ausentes → falha de render (nunca corpo parcial).

---

## 5. Autenticação e autorização

- **Supabase Auth**: e-mail+senha (mín. 12 caracteres, verificação de e-mail), OAuth opcional; MFA TOTP recomendado para B2B.
- **JWT**: assinado pelo Supabase; nunca decodificar no client para decisões de autorização — decisões no servidor/RLS.
- **Sessão**: cookies HttpOnly, `Secure`, `SameSite=Lax`; refresh token rotativo; logout revoga.
- **Roles**: `profiles.role` (b2c/b2b/admin) — coluna somente leitura para o usuário (§7 de [DATABASE_RLS.md](DATABASE_RLS.md)).
- **Server Actions**: toda action começa por `requireUser()` + validação de posse; mutações financeiras exigem reautenticação quando o valor muda (ex.: novo checkout).
- **Webhooks**: token em tempo constante (`crypto.timingSafeEqual`), nunca `===` em segredo.
- **`service_role`**: importada apenas em `lib/supabase/admin.ts` (server-only), guarded por `import "server-only"`; uso restrito a workers/webhooks/rotinas administrativas; toda chamada registra feed quando afeta usuário.

---

## 6. Transporte e cabeçalhos

### 6.1 Headers (via `next.config.mjs` + `middleware.ts`)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://*.supabase.co https://*.asaas.com; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co https://*.asaas.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

- CSP evolve para nonce/hash (remove `'unsafe-inline'`) assim que estável; quebra de CSP = bug de release.
- HSTS só em produção (domínio com HTTPS válido em todos os subdomínios).

### 6.2 CORS

- API própria: mesmo origin (`NEXT_PUBLIC_APP_URL`); sem `Access-Control-Allow-Origin: *` em rotas autenticadas.
- Webhooks recebem apenas POST do Asaas/Evolution; validação de token **antes** de parse pesado.

### 6.3 TLS / SAN (certificados)

- TLS 1.2+ obrigatório; TLS 1.3 preferido.
- Certificados com **SAN** (Subject Alternative Name) cobrindo domínio apex e `www` (`EventeIA.com`, `www.EventeIA.com`); renovação automática (provedor de hosting) com alerta 21 dias antes do vencimento.
- HSTS preload somente após validar todos os subdomínios.

---

## 7. Rate limiting e abuso

| Superfície | Limite (inicial) |
|---|---|
| Login/signup | 10/min por IP |
| Checkout | 5/hora por usuário; 1 pendente por evento |
| Webhooks Asaas | 600/min por token (janela deslizante) |
| Webhooks Evolution | 300/min por token |
| API de feeds | 60/min por usuário |
| Envio WhatsApp | 15/min por instância + 1/60s por número (§[WHATSAPP_EVOLUTION.md](WHATSAPP_EVOLUTION.md)) |

Implementação: Redis (Upstash/BullMQ) com chave `rl:{scope}:{id}:{janela}`; excedeu → `429` + `Retry-After`, feed de abuso para repetição.

---

## 8. Segredos

- `.env.local` (nunca commitado; `.gitignore` bloqueia `.env*` exceto `.env.example`).
- `.env.example` lista nomes e **valores vazios/placeholder**, nunca reais.
- Rotação: Asaas/Evolution/Supabase keys a cada 90 dias ou sob suspeita; vazamento → rotação imediata + auditoria de uso (feeds + logs).
- CI usa secrets do GitHub Actions; nenhum valor em workflow (use `${{ secrets.X }}`).
- **Scanner**: `gitleaks`/`trufflehog` no CI e hook `pre-commit`; achado = build vermelho.

---

## 9. Supply chain e dependências

- `pnpm audit --audit-level high` no CI (bloqueante); exceções documentadas em `.auditrc` com justificativa e prazo.
- Dependabot: atualizações semanais; CVEs críticas são aplicadas no mesmo dia.
- Lockfile commitado; `pnpm install --frozen-lockfile` no CI.
- Novas dependências: revisar licença (MIT/Apache/ISC), manutenção, tamanho e histórico de CVEs (AGENTS.md §3.4).
- **CodeQL** (GitHub) semanal + no PR (quando habilitado no repositório).

---

## 10. Mitigação de vulnerabilidades — processo

1. **Detecção**: Dependabot, CodeQL, `pnpm audit`, gitleaks, revisão de PR (checklist §11), pentest anual (quando volume justificar).
2. **Triagem** (SLA): crítico 24h · alto 7 dias · médio 30 dias · baixo 90 dias.
3. **Correção**: PR pequeno no tronco (TBD), com teste de regressão; nunca "mitigação silenciosa" sem registro.
4. **Divulgação responsável**: `security@eventeia.com`; política publicada em `/seguranca`; sem recompensa monetária por enquanto.
5. **Resposta a incidentes** (runbook resumido):
   - Contenção (revogar chaves, suspender webhooks, rotacionar tokens) → Erradicação → Recuperação → Post-mortem em 5 dias úteis → feeds `admin.*` e comunicação à ANPD se aplicável (prazo legal).

---

## 11. Checklist de segurança de PR

- [ ] Entrada validada com zod na fronteira alterada.
- [ ] Nenhuma consulta que ignore RLS sem justificativa; nenhuma policy permissiva.
- [ ] Nenhum segredo no diff (gitleaks verde).
- [ ] `dangerouslySetInnerHTML` ausente (ou sanitizado + justificado).
- [ ] Logs sem PII/segredos; telefone mascarado.
- [ ] Webhooks com token validado em tempo constante.
- [ ] Dependência nova discutida e licenciada.
- [ ] Headers/CSP inalterados ou atualizados conscientemente.
- [ ] Testes de autorização cobrindo "outro usuário" no fluxo alterado.

---

## 12. Contato

- Vulnerabilidades: `security@eventeia.com` (PGP sob solicitação).
- Privacidade/LGPD: `privacidade@eventeia.com`.

## Oferta de boas-vindas (migração 0022) — revisão de segurança

- **LGPD:** IP e id de aparelho só são gravados como `HMAC-SHA256(WELCOME_HASH_SALT, valor)`; o IP bruto nunca é persistido nem logado. Sem salt configurado a oferta fica desligada (falha fechada).
- **RLS:** `welcome_offers` e `welcome_rate_limits` com RLS forçada; só admin lê ofertas; escrita apenas via funções `SECURITY DEFINER` executáveis por `service_role`.
- **Prazo real:** `expires_at = now() + 24h` no banco; checkout reserva com `now()` do banco. O client recebe só o tempo restante (sem o código do cupom).
- **Anti-abuso:** 1 oferta por hash de IP, por aparelho e por conta (índices únicos; expirar não libera outra); rate limit de 30 req/min por IP; POST exige mesma origem; oferta presa a 1 conta e 1 evento; redenção só em `paid/confirmed`.

## Cupom sorteado (migração 0025) — revisão de segurança

- Sorteio só no servidor (`crypto.randomInt(20, 41)`); o banco valida 20..40 (CHECK + função). O client não envia percentual; checkout usa o valor gravado.
- Concorrência: `pg_advisory_xact_lock` por aparelho/conta — cliques simultâneos não geram dois sorteios na janela de 48h.
- RLS forçada em `lucky_coupons`; só admin lê; RPCs `SECURITY DEFINER` com EXECUTE só para `service_role`. LGPD: apenas HMACs (IP, aparelho, visita).
- Aditiva: 2 colunas nullable em `welcome_offers` (`visit_hash`, `forfeited_at`), nova tabela, novas funções e trigger. Sem DROP/DELETE.
