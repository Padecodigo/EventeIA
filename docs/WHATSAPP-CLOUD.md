# WhatsApp Cloud API (Meta) — canal oficial da EventeIA

A EventeIA tem **dois canais de WhatsApp** atrás de uma única interface (`lib/whatsapp/provider.ts`):

| Canal | Número | Quando é usado |
|---|---|---|
| `cloud` — WhatsApp Cloud API (Meta, direto) | Número **da EventeIA** | **Primário**: padrão sempre que configurado |
| `evolution` — Evolution API v2 | WhatsApp **do próprio cliente** | Fallback, ou quando escolhido no cliente/evento |

Ordem de escolha: `events.whatsapp_channel` → `profiles.whatsapp_channel` → padrão (`cloud` se
`WHATSAPP_CLOUD_TOKEN` e `WHATSAPP_CLOUD_PHONE_NUMBER_ID` estiverem preenchidos, senão `evolution`).
Se `cloud` for escolhido mas não estiver configurado, o envio cai para `evolution`.

Fila (BullMQ), mensagens por categoria, escopo e extração de cotações **não mudam**: os dois
webhooks alimentam o mesmo pipeline de entrada (`lib/whatsapp/inbound.ts`).

## Regras da Meta aplicadas no código

- **Primeiro contato = template aprovado.** O texto continua vindo de
  `lib/whatsapp/first-contact.ts`; ele é fatiado por frases nas variáveis do corpo
  (`{{1}}`, `{{2}}`, `{{3}}` por padrão — `WHATSAPP_CLOUD_FIRST_CONTACT_PARAM_COUNT`).
- **Texto livre só na janela de 24h** após a última mensagem recebida do fornecedor. Fora da
  janela, o follow-up é cancelado com `error = "window_closed"` (não é enviado).
- Webhook `POST` só é aceito com `X-Hub-Signature-256` válido (HMAC-SHA256 do corpo com o App Secret).

## Passo a passo na Meta (manual)

1. **Meta Business (Business Manager)** — em <https://business.facebook.com>, crie/use o portfólio
   empresarial da EventeIA e conclua a **verificação da empresa** (CNPJ/documentos). Sem
   verificação, há limite baixo de conversas iniciadas.
2. **App** — em <https://developers.facebook.com/apps>, crie um app do tipo **Empresa** vinculado ao
   portfólio e adicione o produto **WhatsApp**.
3. **Número** — em *WhatsApp → Configuração da API*, adicione o número da EventeIA (não pode estar
   ativo no app WhatsApp comum; se estiver, apague a conta nele antes), verifique por SMS/ligação,
   defina o **nome de exibição** (passa por aprovação) e copie o **Phone number ID**
   → `WHATSAPP_CLOUD_PHONE_NUMBER_ID`.
4. **Token permanente** — em *Configurações do negócio → Usuários do sistema*, crie um usuário do
   sistema (Admin), atribua o app e a conta do WhatsApp (WABA) e gere um token com as permissões
   `whatsapp_business_messaging` e `whatsapp_business_management` → `WHATSAPP_CLOUD_TOKEN`.
   (O token temporário de 24h da tela inicial **não** serve para produção.)
5. **App Secret** — em *Configurações do app → Básico* → **Chave secreta do app**
   → `WHATSAPP_CLOUD_APP_SECRET`.
6. **Template de primeiro contato** — em *WhatsApp Manager → Modelos de mensagem*, crie:
   - Nome: `eventeia_primeiro_contato` (ou outro, em `WHATSAPP_CLOUD_FIRST_CONTACT_TEMPLATE`)
   - Categoria: **Utilidade** (se a Meta reclassificar, Marketing) · Idioma: **Português (BR)**
     (`pt_BR`, em `WHATSAPP_CLOUD_TEMPLATE_LANGUAGE`)
   - Corpo sugerido (3 variáveis, mesmo número de `WHATSAPP_CLOUD_FIRST_CONTACT_PARAM_COUNT`):

     ```
     {{1}}

     {{2}}

     {{3}}

     Mensagem enviada pela EventeIA.
     ```
   - Exemplos para aprovação: `Boa tarde, tudo bem? Aqui é da EventeIA. Gostaria de um orçamento de buffet.` /
     `Estamos organizando um casamento para 120 convidados em Campinas no dia 12/12/2026.` /
     `Estamos fazendo um levantamento de orçamentos. Se não quiser receber mensagens, responda SAIR.`
   - Aguarde o status **Aprovado** antes de ligar o canal.
7. **Webhook** — em *WhatsApp → Configuração*:
   - URL de callback: `https://<dominio-da-eventeia>/api/webhooks/whatsapp-cloud`
   - Token de verificação: o mesmo valor de `WHATSAPP_CLOUD_VERIFY_TOKEN` (gere um aleatório longo).
   - Clique em **Verificar e salvar** (a rota responde o `hub.challenge`) e assine o campo **messages**.
8. **Modo do app** — coloque o app em modo **Ativo/Live** e adicione uma **forma de pagamento** na
   conta do WhatsApp (conversas iniciadas pela empresa são cobradas).
9. **Variáveis de ambiente** — preencha no servidor (nunca no Git):

   ```
   WHATSAPP_CLOUD_TOKEN=...
   WHATSAPP_CLOUD_PHONE_NUMBER_ID=...
   WHATSAPP_CLOUD_VERIFY_TOKEN=...
   WHATSAPP_CLOUD_APP_SECRET=...
   WHATSAPP_CLOUD_FIRST_CONTACT_TEMPLATE=eventeia_primeiro_contato
   WHATSAPP_CLOUD_TEMPLATE_LANGUAGE=pt_BR
   WHATSAPP_CLOUD_FIRST_CONTACT_PARAM_COUNT=3
   ```
10. **Migração** — aplique `supabase/migrations/0024_whatsapp_dual_channel.sql` (aditiva; requer
    revisão Supabase + Security antes).

## Testar

- Verificação: `curl "https://<dominio>/api/webhooks/whatsapp-cloud?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123"` → `123`.
- No painel da Meta, use **Testar** no campo `messages` do webhook e confira o registro em
  `webhook_events` com `source = 'whatsapp_cloud'`.
- Para forçar o canal Evolution em um evento: `update events set whatsapp_channel = 'evolution' where id = '<id>';`
