# Deploy de produção — EventeIA

```
Cloudflare (DNS proxied, WAF, SSL Full strict)
        │ 443
        ▼
Hetzner CX33 (4 vCPU / 8 GB, Ubuntu 24.04) — Docker + Coolify (Traefik)
  ├─ app            Next.js 15 standalone  (público: APP_DOMAIN)
  ├─ worker         mesma imagem, `node workers.cjs` (BullMQ, sem porta)
  ├─ evolution-api  evoapicloud/evolution-api:v2.3.7 (público: EVOLUTION_DOMAIN)
  ├─ evolution-db   postgres:16-alpine (interno)
  └─ redis          redis:7-alpine, AOF + senha (interno)
        │
        ▼
Supabase Cloud (Postgres do app, Auth, Storage)
```

Arquivos: `Dockerfile`, `docker-compose.prod.yml`, `.dockerignore`, `.env.production.example`.
O `docker-compose.dev.yml` continua sendo só para desenvolvimento local.

## Decisões

- **Worker separado do app (mesma imagem).** Falha/OOM/backlog de fila não derruba o site, e é possível reiniciar/escalar os workers sozinhos. `workers/index.ts` é empacotado com esbuild (`pnpm build:workers` → `dist/workers.cjs`), então o runtime não precisa de `tsx` nem de `node_modules` completos.
- **Postgres próprio para a Evolution (não Supabase).** A Evolution v2 roda migrations Prisma próprias e grava muito (mensagens, contatos, chats, sessões Baileys). No Supabase isso (a) mistura um schema de terceiros com os dados do app e com as políticas RLS, (b) consome conexões e cota de disco/IO do plano e (c) adiciona latência de rede a cada evento do WhatsApp. Um `postgres:16-alpine` local com 512 MB é suficiente, fica na rede interna e tem backup independente. Os dados de negócio continuam 100% no Supabase.
- **Redis sem porta pública**, com `requirepass`, AOF `everysec` e `maxmemory-policy noeviction` (obrigatório para BullMQ: nunca descartar jobs). BullMQ usa DB 0, Evolution usa DB 6.
- **Webhook da Evolution → app pela rede Docker** (`http://app:3000/api/webhooks/evolution?token=…`): não passa pela Cloudflare nem sai do servidor.
- **Limites de memória** (somam ~5,3 GB; ~2,7 GB ficam para SO, Docker, Coolify e Traefik): app 1,5 GB · worker 1 GB · evolution 1,5 GB · evolution-db 512 MB · redis 640 MB (maxmemory 512 MB).
- **`NEXT_PUBLIC_*` são build args**: mudar URL/anon key do Supabase exige rebuild.

## 1. Servidor (Hetzner)

1. Criar CX33 Ubuntu 24.04, com chave SSH (sem senha). Ativar backups da Hetzner (snapshots diários).
2. Hardening básico:
   ```bash
   adduser deploy && usermod -aG sudo deploy
   # /etc/ssh/sshd_config: PasswordAuthentication no, PermitRootLogin prohibit-password
   apt update && apt -y upgrade && apt -y install ufw fail2ban unattended-upgrades
   ufw default deny incoming && ufw default allow outgoing
   ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
   ufw enable
   ```
   > Docker publica portas por fora do ufw (iptables). Por isso **nenhum** serviço interno usa `ports:`; só o Traefik do Coolify publica 80/443.
   > O painel do Coolify (porta 8000) e as portas 6001/6002: após configurar um domínio para o painel (ex.: `coolify.eventeia.com.br` via Traefik), não liberar no ufw — acessar via domínio ou túnel SSH (`ssh -L 8000:localhost:8000`).
   > Opcional (recomendado): no **Firewall da Hetzner** liberar 80/443 apenas para os [IPs da Cloudflare](https://www.cloudflare.com/ips/) e 22 só para seu IP.
3. Instalar Coolify: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash`.

## 2. Cloudflare — DNS

| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| A | `app` (ou `@`) | IPv4 da Hetzner | Proxied (nuvem laranja) |
| A | `api.whatsapp` | IPv4 da Hetzner | Proxied |
| AAAA (opcional) | idem | IPv6 da Hetzner | Proxied |

> `api.whatsapp.eventeia.com.br` é subdomínio de 2º nível: o certificado Universal gratuito da Cloudflare cobre só `*.eventeia.com.br`. Use **Advanced Certificate Manager** ou troque para um nome de 1 nível, ex. `whatsapp-api.eventeia.com.br` (recomendado, sem custo). Ajuste `EVOLUTION_DOMAIN`.

## 3. Cloudflare — SSL/TLS

1. SSL/TLS → Overview → **Full (strict)**. Edge Certificates: *Always Use HTTPS* ON, *Minimum TLS* 1.2, *Automatic HTTPS Rewrites* ON. HSTS já é enviado pelo app.
2. Certificado na origem (escolha um):
   - **A) Cloudflare Origin Certificate (mais simples com proxy):** SSL/TLS → Origin Server → Create Certificate (RSA, hostnames `eventeia.com.br, *.eventeia.com.br`, 15 anos). No Coolify: Servers → Proxy → adicionar o cert/key em `/data/coolify/proxy/certs/` e um arquivo dynamic `tls.certificates`. Defina `TRAEFIK_CERTRESOLVER=` vazio para os routers não pedirem Let's Encrypt. Opcional: *Authenticated Origin Pulls*.
   - **B) Let's Encrypt via DNS-01:** criar API Token Cloudflare (Zone:DNS:Edit só desta zona); no Coolify configurar o Traefik com `--certificatesresolvers.letsencrypt.acme.dnschallenge.provider=cloudflare` e env `CF_DNS_API_TOKEN`. HTTP-01 funciona atrás do proxy na maioria dos casos, mas DNS-01 é o mais robusto.
3. **Não cachear API/webhooks** — Caching → Cache Rules:
   - Regra "Bypass API": `(http.host eq "app.eventeia.com.br" and starts_with(http.request.uri.path, "/api/"))` → *Bypass cache*.
   - Regra "Bypass Evolution": `http.host eq "<EVOLUTION_DOMAIN>"` → *Bypass cache*.
   - Security → WAF: não aplicar challenge/Bot Fight em `/api/webhooks/*` (Asaas é server-to-server; um challenge quebra o webhook). Crie uma *Skip rule* para esse path.
   - Desative *Rocket Loader* (quebra o CSP/hidratação do Next).

## 4. Supabase Cloud

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push            # aplica supabase/migrations
supabase test db --linked   # opcional: testes RLS contra o remoto (cuidado: nunca em dados reais)
```
- Auth → URL Configuration: Site URL `https://app.eventeia.com.br`, redirect URLs do app.
- Plano Pro para PITR/backups diários; habilitar SMTP próprio (Resend) no Auth.
- `SUPABASE_SERVICE_ROLE_KEY` só no servidor (app/worker), nunca em `NEXT_PUBLIC_*`.

## 5. Coolify — checklist de deploy

1. Sources → GitHub App → conectar `Padecodigo/EventeIA` (privado).
2. Project → New Resource → **Docker Compose** → branch `main` → arquivo `docker-compose.prod.yml`.
3. Environment Variables: colar todas de `.env.production.example` com valores reais (marcar segredos como *Secret*; `NEXT_PUBLIC_*` também como *Build Variable*).
4. Domínios: o compose já traz labels Traefik (`APP_DOMAIN`, `EVOLUTION_DOMAIN`). Se preferir a UI do Coolify para domínios, remova as labels para não duplicar routers.
5. Gerar segredos: `openssl rand -hex 32` para `REDIS_PASSWORD`, `EVOLUTION_DB_PASSWORD`, `EVOLUTION_API_KEY`, `*_WEBHOOK_TOKEN`, `WHATSAPP_CREDENTIALS_KEY`.
6. Deploy. Verificar: todos os containers `healthy`; `curl -I https://app.eventeia.com.br/api/health` → 200; `https://<EVOLUTION_DOMAIN>/` responde com a versão.
7. Ativar *Auto Deploy* por webhook do GitHub no push em `main` (após CI verde).

## 6. Webhooks

| Origem | URL | Autenticação |
|---|---|---|
| Asaas (Integrações → Webhooks) | `https://app.eventeia.com.br/api/webhooks/asaas` | campo *Token de autenticação* = `ASAAS_WEBHOOK_TOKEN` (header `asaas-access-token`) |
| Evolution (global, interno) | `http://app:3000/api/webhooks/evolution?token=<EVOLUTION_WEBHOOK_TOKEN>` | já setado no compose |

Asaas: cadastrar o webhook **separadamente** no sandbox e na produção; eventos de cobrança (`PAYMENT_*`). Fila de sincronização: se ficar interrompida (>15 falhas), reativar no painel.

## 7. Backups

```bash
# /etc/cron.d/eventeia-backup  (diário 03:00), depois enviar para Hetzner Storage Box / S3 (restic/rclone)
docker exec eventeia-evolution-db-1 pg_dump -U evolution -Fc evolution > /backup/evolution-$(date +%F).dump
docker run --rm -v eventeia_evolution-instances:/v -v /backup:/b alpine tar czf /b/evolution-instances-$(date +%F).tgz -C /v .
docker exec eventeia-redis-1 sh -c 'redis-cli BGSAVE'; sleep 5
docker run --rm -v eventeia_redis-data:/v -v /backup:/b alpine tar czf /b/redis-$(date +%F).tgz -C /v .
find /backup -mtime +14 -delete
```
- Nomes de containers/volumes no Coolify recebem prefixo do UUID do recurso: confira com `docker ps` / `docker volume ls`.
- Coolify também oferece *Scheduled Backups* para Postgres; Supabase tem backups próprios.
- **Teste a restauração** pelo menos uma vez antes do go-live.

## 8. Monitoramento e logs

- Logs: `docker logs -f <container>` ou aba Logs do Coolify (rotação json-file 20 MB × 5 já configurada).
- Uptime externo (UptimeRobot / Better Stack) em `/api/health` e no domínio da Evolution; alerta por e-mail/WhatsApp.
- Coolify → Notifications (e-mail/Discord/Telegram) para falha de deploy e container unhealthy.
- Métricas do host: Coolify *Sentinel* ou Netdata; alerta de disco > 80% e RAM.
- Filas: acompanhar jobs `failed` no Redis (ex.: Bull Board protegido, ou `redis-cli` via `docker exec`). Nunca expor o Redis.
- Erros de aplicação: integrar Sentry (opcional).

## 9. Checklist pré-produção

- [ ] Todas as chaves reais configuradas no Coolify; nenhuma chave de dev/sandbox sobrando.
- [ ] Asaas: `ASAAS_ENVIRONMENT=production`, nova `ASAAS_API_KEY` de produção, webhook de produção cadastrado com novo token.
- [ ] `DEMO_LOGIN_ENABLED=false` e nenhuma variável `DEMO_*` definida; rota `/api/dev/*` inacessível em produção.
- [ ] Revisão de segurança: RLS em todas as tabelas, service role só no servidor, CSP, rate limit nos webhooks, tokens rotacionados, `.env*` fora do git.
- [ ] Substituir depoimentos de exemplo por depoimentos reais (com consentimento).
- [ ] LGPD: Política de Privacidade e Termos de Uso publicados, base legal para contato via WhatsApp, canal do encarregado (DPO), retenção/exclusão de dados.
- [ ] Supabase: migrations aplicadas (`supabase db push`), URLs de Auth corretas, plano com backup.
- [ ] Cloudflare: Full (strict), regras de bypass de cache em `/api/*` e Evolution, WAF sem challenge em webhooks.
- [ ] ufw ativo (22/80/443), SSH só por chave, fail2ban, unattended-upgrades.
- [ ] Backups agendados e restauração testada.
- [ ] Uptime monitor e notificações do Coolify ativos.
- [ ] Teste ponta a ponta: cadastro → pagamento (Asaas) → webhook → crédito; conexão WhatsApp (QR) → mensagem → webhook → worker.
