# SEO e descoberta por buscadores e IAs

## O que já está no código
- `app/robots.ts` → `/robots.txt`: libera páginas públicas para buscadores e robôs de IA, e bloqueia `/painel`, `/admin`, `/api`, `/dev`, `/eventos`, `/creditos`, `/perfil` e `/depoimento`. Os robôs liberados estão em `lib/seo/bots.ts`: Googlebot, Google-Extended, Bingbot, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Perplexity-User, meta-externalagent, meta-externalfetcher, FacebookBot, facebookexternalhit, Applebot, Applebot-Extended, DuckDuckBot, Amazonbot, YouBot, CCBot, Bytespider, YandexBot, SeznamBot, Twitterbot e LinkedInBot. xAI/Grok e Manus não publicam user-agent de crawler; a regra `*` cobre esses robôs.
- `app/sitemap.ts` → `/sitemap.xml`, com as rotas públicas de `PUBLIC_ROUTES`.
- Metadata por página (`pageMetadata` em `lib/seo/site.ts`): título, descrição, palavras-chave, canonical (a partir de `NEXT_PUBLIC_SITE_URL`) e Open Graph/Twitter com `og:locale=pt_BR`.
- `/og` gera a imagem de compartilhamento 1200x630 para Instagram, Facebook, X e LinkedIn.
- O JSON-LD da home inclui Organization, WebSite, Service/SoftwareApplication com ofertas dos planos, LocalBusiness com `areaServed` do Vale do Paraíba e FAQPage.
- `/llms.txt`, `/llms-full.txt` e `/precos.json` trazem o resumo e os preços para assistentes de IA.
- IndexNow: `/indexnow-key.txt` serve `INDEXNOW_KEY`. Use `pnpm seo:indexnow` (dry-run) ou `pnpm seo:indexnow --send [urls]`.
- As páginas públicas são Server Components. O conteúdo (textos, FAQ em `<details>`) vem no HTML, sem depender de JS no cliente.

## Antes de publicar
1. Defina `NEXT_PUBLIC_SITE_URL=https://seu-dominio` (sem barra no final).
2. Gere uma chave IndexNow com `openssl rand -hex 16` e defina `INDEXNOW_KEY`.
3. Confira `https://seu-dominio/robots.txt`, `/sitemap.xml`, `/indexnow-key.txt` e `/og`.

## Google Search Console
1. Acesse https://search.google.com/search-console e clique em **Adicionar propriedade**.
2. Escolha **Domínio** e informe `seu-dominio`.
3. Copie o registro TXT e crie esse registro no DNS do domínio. Depois clique em **Verificar** (o DNS pode levar alguns minutos para propagar).
4. Em **Sitemaps**, envie `https://seu-dominio/sitemap.xml`.
5. Em **Inspeção de URL**, teste a home e clique em **Solicitar indexação**.
6. Valide os dados estruturados em https://search.google.com/test/rich-results.

## Bing Webmaster Tools (também alimenta Copilot, ChatGPT search, DuckDuckGo e Yahoo)
1. Acesse https://www.bing.com/webmasters e entre com uma conta Microsoft.
2. Escolha **Importar do Google Search Console** e autorize. O site e o sitemap são importados já verificados.
3. Sem GSC, adicione o site manualmente, verifique por DNS (CNAME) e envie o sitemap.
4. Em **IndexNow**, confirme que a chave foi detectada. A cada publicação, rode `pnpm seo:indexnow --send`.
5. Yandex (https://webmaster.yandex.com) e Seznam recebem o IndexNow automaticamente; o cadastro é opcional.

## Perfil da Empresa no Google (busca local no Vale do Paraíba)
1. Acesse https://business.google.com e clique em **Gerenciar agora**.
2. Use o nome "EventeIA" e a categoria "Serviço de planejamento de eventos".
3. Sem atendimento presencial, escolha **área de serviço** e marque São José dos Campos, Taubaté, Jacareí, Caçapava, Pindamonhangaba, Guaratinguetá e as demais cidades do Vale do Paraíba (até 20).
4. Informe o telefone e o site (`NEXT_PUBLIC_SITE_URL`), depois conclua a verificação (vídeo, telefone ou carta).
5. Preencha a descrição com as palavras-chave (orçamento de festa, festa infantil, casamento, 15 anos, formatura, corporativo) e publique fotos.
6. Peça avaliações aos clientes; elas pesam muito na busca local.

## Prévias de links
- Facebook/Instagram: https://developers.facebook.com/tools/debug/ (clique em **Coletar novamente** após mudanças).
- LinkedIn: https://www.linkedin.com/post-inspector/
- X: a prévia aparece no compositor de posts.
