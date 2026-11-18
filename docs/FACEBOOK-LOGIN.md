# Login com Facebook (“Entrar com Facebook”)

O EventeIA usa o **Supabase Auth (OAuth, provider `facebook`)** para login/cadastro
e para conectar o Facebook a uma conta já existente no perfil.

O botão só aparece quando `NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED` está ligado
(`true`, `1`, `yes` ou `on`). **Por padrão a flag vem desligada** — dê para
construir e testar em modo de desenvolvimento com usuários de teste da Meta,
sem abrir o login ao público.

Fluxo de entrada: `/entrar` ou `/registrar` → botão **Entrar com Facebook** →
Meta → Supabase (`/auth/v1/callback`) → app (`/auth/callback`) → `/painel`.

Fluxo de vínculo no perfil: **Conectar** → `linkIdentity` → mesmo callback do
Supabase → app (`/auth/callback`) → `/perfil`.

Instagram Login **não** faz parte deste documento: não é provider nativo do
Supabase e o app não implementa OAuth custom. O botão permanece **Em breve**.
O `@` de contato (`instagram_handle`) no perfil é independente deste login.

---

## 1. Criar o app na Meta

1. Acesse <https://developers.facebook.com/> e entre com a conta da Meta.
2. **Meus aplicativos → Criar aplicativo**. Preencha o nome (`EventeIA`) e os
   dados pedidos.
3. Adicione o produto **Facebook Login**. Pule o Quickstart; abra
   **Facebook Login → Settings**.
4. Em **Valid OAuth Redirect URIs**, cadastre o callback do **Supabase**
   (não o do app):

   - Local: `http://127.0.0.1:54321/auth/v1/callback` (e também
     `http://localhost:54321/auth/v1/callback`)
   - Produção: `https://<project-ref>.supabase.co/auth/v1/callback`

   A URI de produção também aparece no painel do Supabase em
   **Authentication → Providers → Facebook → Callback URL**.
5. Em **Use Cases → Authentication and Account Creation**, confira os escopos
   **`public_profile`** e **`email`**. Os dois precisam estar prontos para
   teste (o `email` é obrigatório para o Supabase Auth). Se o `email` não
   estiver na lista, adicione.
6. Em **Settings → Basic**, copie o **App ID** e o **App Secret**.
   Guarde-os no cofre de segredos — **nunca** commite no repositório.
7. Em modo **Development**, só entram usuários com papel no app (admin,
   desenvolvedor ou testador). Para o público, é preciso colocar o app em
   **Live** e, se a Meta pedir, concluir a **App Review** (`public_profile` +
   `email`).

## 2. Ambiente local (Supabase CLI)

1. Em `.env.local` (ou exportados no shell que roda o `supabase start`):

   ```bash
   SUPABASE_AUTH_EXTERNAL_FACEBOOK_CLIENT_ID="seu-app-id"
   SUPABASE_AUTH_EXTERNAL_FACEBOOK_SECRET="seu-app-secret"
   NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED="true"
   ```

   O `supabase/config.toml` já tem `[auth.external.facebook]` lendo o ID e o
   secret via `env()` — nada de credencial no repositório.
2. Reinicie o Supabase local para carregar o provider:
   `npx supabase stop && npx supabase start`.
3. URL de retorno do app já liberada em `additional_redirect_urls`:
   `http://localhost:3000/auth/callback`.
4. Ligue a flag no ambiente do Next (`NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED=true`)
   e reinicie o app (a variável é `NEXT_PUBLIC_` e entra no bundle).
5. Abra <http://localhost:3000/entrar> e clique em **Entrar com Facebook**,
   usando um usuário de teste do app da Meta.

## 3. Produção (Supabase Cloud)

Nenhuma destas etapas é feita por este repositório: o Allan configura no
painel, quando quiser ligar o login.

1. Painel do Supabase → **Authentication → Sign In / Providers → Facebook** →
   ative e cole o **App ID** (Client ID) e o **App Secret** (Client Secret).
2. **Authentication → URL Configuration**:
   - Site URL: `https://eventeia.com.br`
   - Redirect URLs: `https://eventeia.com.br/auth/callback`
3. Confirme `NEXT_PUBLIC_APP_URL=https://eventeia.com.br` no ambiente do app
   (é a origem usada no `redirectTo`).
4. Só então ligue `NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED=true` no ambiente do
   app e faça um novo deploy (a flag é embutida no build). Enquanto a flag
   estiver desligada, o botão não aparece mesmo com o provider ativo.

## 4. Resumo das URLs de redirecionamento

| Onde                                         | Local                                     | Produção                                             |
| -------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| Meta → Valid OAuth Redirect URIs             | `http://127.0.0.1:54321/auth/v1/callback` | `https://<project-ref>.supabase.co/auth/v1/callback` |
| Escopos no app da Meta                       | `public_profile`, `email`                 | `public_profile`, `email`                            |
| Supabase → Redirect URLs (app)               | `http://localhost:3000/auth/callback`     | `https://eventeia.com.br/auth/callback`              |

## 5. Contas existentes, perfil e segurança

- Quem já tem conta com e-mail/senha (ou Google) e entra com Facebook **usando
  o mesmo e-mail verificado** pode ter a identidade vinculada automaticamente
  pelo Supabase; o perfil é o mesmo.
- No perfil, **Conectar** chama `linkIdentity` e **Desconectar** chama
  `unlinkIdentity`. O app **não desvincula a última identidade** de uma conta
  sem senha — nesse caso, é preciso criar uma senha (ou manter outro login)
  antes de desconectar.
- `profiles.email` continua sendo gravado só por triggers `security definer` a
  partir de `auth.users`.
- O parâmetro `?next=` do callback só aceita caminhos internos (proteção contra
  open redirect). O retorno ao perfil depois do vínculo usa o cookie
  `eventeia_auth_next`, sem `?next=` na allowlist.

## 6. Problemas comuns

- **Redirect URI mismatch**: a URI na Meta deve ser exatamente a do Supabase
  (`/auth/v1/callback`), sem barra no final.
- **“Unsupported provider: provider is not enabled”**: o provider não está
  ativo no painel (produção) ou as variáveis não foram carregadas — reinicie
  o Supabase local.
- **Volta para `/entrar?erro=oauth`**: o `code` expirou ou a URL
  `/auth/callback` não está nas Redirect URLs do Supabase.
- **“App not setup”** / só testers entram: o app da Meta ainda está em
  Development. Adicione o usuário como testador ou conclua a App Review e
  publique.
- **E-mail não veio do Facebook**: confira o escopo `email` em Use Cases
  (Authentication and Account Creation) e se a pessoa tem e-mail confirmado
  no Facebook.
- **Botão não aparece**: `NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED` não está ligado
  no ambiente do build.
