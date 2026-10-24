# Login com Google (“Entrar com Google”)

O EventeIA usa o **Supabase Auth (OAuth, provider `google`)** para login/cadastro em um clique.
Ao entrar com Google, o perfil é criado automaticamente com **nome e e-mail** da conta Google,
e esse e-mail é usado para avisar quando o **orçamento estiver pronto**.

Fluxo: `/entrar` ou `/registrar` → botão **Entrar com Google** → Google → Supabase
(`/auth/v1/callback`) → app (`/auth/callback`) → `/painel`.

---

## 1. Criar o cliente OAuth no Google Cloud

1. Acesse <https://console.cloud.google.com/> e selecione (ou crie) o projeto **EventeIA**.
2. Menu **APIs e serviços → Tela de consentimento OAuth** (ou **Google Auth Platform → Branding**):
   - Tipo de usuário: **Externo**.
   - Nome do app: `EventeIA`; e-mail de suporte; logo (opcional).
   - Domínios autorizados: `eventeia.com.br` e o domínio do Supabase (`<project-ref>.supabase.co`).
   - Escopos: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (não exigem verificação).
   - Publique o app (**Publicar app**) para sair do modo “Teste” — em teste só usuários convidados entram.
3. Menu **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo de aplicativo: **Aplicativo da Web**.
   - Nome: `EventeIA Web`.
   - **Origens JavaScript autorizadas**:
     - `http://localhost:3000`
     - `https://app.eventeia.com.br`
   - **URIs de redirecionamento autorizados** (é o callback do **Supabase**, não do app):
     - Local: `http://127.0.0.1:54321/auth/v1/callback` (e também `http://localhost:54321/auth/v1/callback`)
     - Produção: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Clique em **Criar** e copie o **ID do cliente** e a **Chave secreta do cliente**.
   Guarde-os no cofre de segredos — **nunca** commite no repositório.

## 2. Ambiente local (Supabase CLI)

1. Em `.env.local` (ou exportados no shell que roda o `supabase start`):
   ```bash
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com"
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="GOCSPX-..."
   ```
   O `supabase/config.toml` já tem `[auth.external.google] enabled = true` lendo essas variáveis.
2. Reinicie o Supabase local para carregar o provider: `npx supabase stop && npx supabase start`.
3. Aplique a migração `0021_profile_email_google.sql`: `npx supabase migration up`.
4. URL de retorno do app já liberada em `additional_redirect_urls`: `http://localhost:3000/auth/callback`.
5. Abra <http://localhost:3000/entrar> e clique em **Entrar com Google**.

## 3. Produção (Supabase Cloud)

1. Painel do Supabase → **Authentication → Sign In / Providers → Google** → ative e cole
   **Client ID** e **Client Secret**.
2. **Authentication → URL Configuration**:
   - Site URL: `https://app.eventeia.com.br`
   - Redirect URLs: `https://app.eventeia.com.br/auth/callback`
3. Confirme `NEXT_PUBLIC_APP_URL=https://app.eventeia.com.br` no ambiente do app (é a origem usada no `redirectTo`).
4. Rode as migrações (`npx supabase db push`) para criar `profiles.email`.

## 4. Resumo das URLs de redirecionamento

| Onde                                    | Local                                     | Produção                                             |
| --------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| Google Cloud → URIs de redirecionamento | `http://127.0.0.1:54321/auth/v1/callback` | `https://<project-ref>.supabase.co/auth/v1/callback` |
| Google Cloud → Origens JS               | `http://localhost:3000`                   | `https://app.eventeia.com.br`                        |
| Supabase → Redirect URLs (app)          | `http://localhost:3000/auth/callback`     | `https://app.eventeia.com.br/auth/callback`          |

## 5. Contas existentes e segurança

- Quem já tem conta com e-mail/senha e entra com Google **usando o mesmo e-mail verificado** tem a
  identidade vinculada automaticamente pelo Supabase; o perfil é o mesmo.
- `profiles.email` é gravado **somente** por triggers `security definer` a partir de `auth.users`;
  o cliente não tem permissão de alterá-lo (evita desviar notificações).
- O parâmetro `?next=` do callback só aceita caminhos internos (proteção contra open redirect).

## 6. Problemas comuns

- **`redirect_uri_mismatch`**: a URI no Google Cloud deve ser exatamente a do Supabase (`/auth/v1/callback`).
- **“Unsupported provider: provider is not enabled”**: variáveis não carregadas — reinicie o Supabase.
- **Volta para `/entrar?erro=oauth`**: o `code` expirou ou a URL `/auth/callback` não está nas Redirect URLs.
