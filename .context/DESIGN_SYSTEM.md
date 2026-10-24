# DESIGN_SYSTEM.md — Design System "Atelier" da EventeIA

> **Fonte da verdade visual.** Última revisão: 2026-10-22.
> Tokens implementados em [`tailwind.config.ts`](../tailwind.config.ts) e variáveis CSS (globais em `app/globals.css`).
> Posicionamento: **editorial, sofisticado, humanizado** — inteligência de custos/cotações para eventos (B2C e B2B).

---

## 1. Tom de voz e princípios editoriais

| Princípio | Prática |
|---|---|
| Editorial | Composição tipográfica de revista: títulos serifados grandes, muito respiro, ritmo de coluna |
| Sofisticado | Restração: poucas cores, nenhuma saturação excessiva, nada de gradientes berrantes além do sheen champagne |
| Humanizado | Frases em primeira pessoa, cordiais e diretas; números sempre explicados, nunca "mágicos" |
| Acolhedor, não elitista | Falamos com quem organiza a festa com orçamento real: do salão do bairro ao espaço mais bonito da cidade. Sofisticação sem exclusão — nunca sugerir que só alguns eventos merecem clareza |
| Inteligência | Dados financeiros são protagonistas: tabelas limpas, hierarquia clara, breakdown transparente |

- **Slogan**: “Você imagina. A EventeIA faz acontecer.”
- **Frase humanizada**: “A clareza financeira e a inteligência que o seu evento merece.”
- **Nome oficial**: **EventeIA** — grafia da marca em todos os textos exibidos (interface, marketing e docs). Identificadores técnicos (nome do pacote npm, project_id, instâncias de API, e-mails e domínios) permanecem em minúsculas por convenção.
- ❌ Nunca: gírias agressivas, "!!!" promocionais, emojis em superfícies editoriais, dark patterns de urgência falsa.

---

## 2. Paleta de cores (OFICIAL — não inventar tons)

| Token | Nome | Hex | Papel |
|---|---|---|---|
| `vinho` | Vinho Leve | `#4A2031` | Cor de marca dominante: fundos de seção editorial, texto primário, botões primários |
| `champagne` | Champagne | `#D4AF37` | Destaque/acento: links, filetes, bordas, ícones, texto sobre vinho |
| `champagne-claro` | Champagne Claro | `#EADBBD` | Acento suave (tint derivado), chips, estados de hover, sheen |
| `areia-quente` | Areia Quente | `#F7F3EE` | Fundo padrão de página/seções claras |
| `areia-secundaria` | Areia Secundária | `#EEE7DF` | Superfícies alternadas, linhas de tabela, faixas divisórias |
| `off-white` | Off-White | `#FFFDFA` | Cards, campos, superfícies sobre areia |

### 2.1 Tokens semânticos

| Token semântico | Valor | Uso |
|---|---|---|
| `brand.primary` | `#3D1B28` | Identidade, botões primários |
| `brand.accent` | `#C5A56F` | Acento, foco, destaques |
| `brand.accentSoft` | `#EADBBD` | Acento suave |
| `surface.canvas` | `#FFFDFA` | Fundo máximo (cards) |
| `surface.warm` | `#F7F3EE` | Fundo de página |
| `surface.muted` | `#EEE7DF` | Fundo alternado |
| `surface.dark` | `#3D1B28` | Seções escuras editoriais |
| `ink.primary` | `#3D1B28` | Texto sobre claro |
| `ink.inverse` | `#FFFDFA` | Texto sobre vinho |
| `ink.accent` | `#C5A56F` | Texto de destaque (apenas sobre vinho) |
| `line.subtle` | `rgba(74,32,49,0.12)` | Bordas de cards, divisores |
| `line.strong` | `rgba(74,32,49,0.28)` | Bordas de inputs, ênfase |
| `ring.focus` | `#C5A56F` | Anel de foco acessível |

### 2.2 Variáveis CSS (copiar para `app/globals.css`)

```css
:root {
  /* Paleta oficial — fonte da verdade: .context/DESIGN_SYSTEM.md */
  --color-vinho: #3D1B28;
  --color-areia-quente: #F7F3EE;
  --color-areia-secundaria: #EEE7DF;
  --color-off-white: #FFFDFA;
  --color-champagne: #C5A56F;
  --color-champagne-claro: #EADBBD;

  /* Tokens semânticos */
  --color-primary: var(--color-vinho);
  --color-accent: var(--color-champagne);
  --color-accent-soft: var(--color-champagne-claro);
  --color-surface: var(--color-off-white);
  --color-surface-warm: var(--color-areia-quente);
  --color-surface-muted: var(--color-areia-secundaria);
  --color-text: var(--color-vinho);
  --color-text-inverse: var(--color-off-white);
  --color-text-accent: var(--color-champagne); /* somente sobre vinho */
  --color-border-subtle: rgba(74, 32, 49, 0.12);
  --color-border-strong: rgba(74, 32, 49, 0.28);
  --color-ring: var(--color-champagne);

  /* Tipografia */
  --font-serif: "Fraunces", Georgia, "Times New Roman", serif;
  --font-sans: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;

  /* Ritmo */
  --radius-card: 1rem;
  --shadow-soft: 0 1px 2px rgba(74, 32, 49, 0.06), 0 8px 24px rgba(74, 32, 49, 0.06);
  --shadow-raised: 0 2px 4px rgba(74, 32, 49, 0.08), 0 16px 40px rgba(74, 32, 49, 0.10);
  --ease-editorial: cubic-bezier(0.2, 0, 0, 1);
}
```

> O produto é **light-first**. Não existe paleta dark no DS v1; não invente tons escuros derivados — a única superfície escura oficial é o vinho.

---

## 3. Contraste e acessibilidade (WCAG 2.2 AA)

Razões de contraste medidas (WCAG, arredondadas):

| Par (texto sobre fundo) | Ratio | Veredito | Uso permitido |
|---|---|---|---|
| Vinho Leve sobre Areia Quente | ≈ 12,3:1 | AAA | Corpo de texto padrão |
| Vinho Leve sobre Off-White | ≈ 13,4:1 | AAA | Texto em cards |
| Off-White sobre Vinho Leve | ≈ 13,4:1 | AAA | Texto em seções vinho |
| Areia Quente sobre Vinho Leve | ≈ 12,3:1 | AAA | Idem |
| Champagne Claro sobre Vinho Leve | ≈ 10,0:1 | AAA | Destaques em seções vinho |
| Champagne sobre Vinho Leve | ≈ 6,5:1 | AA | Títulos, labels e acentos sobre vinho |
| Vinho Leve sobre Champagne | ≈ 6,5:1 | AA | Botão champagne com texto vinho |
| **Champagne sobre Areia Quente** | **≈ 1,9:1** | **✗ FALHA** | **Proibido em texto** — decorativo apenas (filetes, ícones grandes) |
| **Champagne sobre Off-White** | **≈ 2,1:1** | **✗ FALHA** | **Proibido em texto** |

Regras:

1. **Champagne nunca é texto sobre fundo claro.** Em fundo claro, use vinho para texto e champagne apenas em elementos gráficos. Eyebrows usam **chip** `champagne-claro` com texto vinho (contraste ≈ 11:1) — nunca champagne puro sobre areia.
2. **Texto secundário**: mínima opacidade de 70% do vinho sobre areia (≈ 5,5:1). Abaixo disso (ex.: `/50`) reprova AA e é proibido em corpo de texto.
3. Estados de foco: anel `#C5A56F` com `outline-offset: 2px`, sempre visível (`:focus-visible`), nunca removido.
4. Erro/sucesso (estados semânticos fora da paleta editorial): usar vermelho `#B3261E` e verde `#1E6B3A` apenas em ícones/labels de validação, nunca como cor de marca.
5. O CI bloqueia regressões de contraste (`color-contrast: error` no [lighthouserc.json](../lighthouserc.json)).
6. **Itálico de ênfase** em títulos usa a cor do texto (vinho), nunca champagne sobre claro — o champagne fica na decoração (filetes, linhas, ícones).

---

## 4. Tipografia

### 4.1 Famílias

| Token | Família | Papel |
|---|---|---|
| `font-serif` | **Fraunces** (fallback: Georgia, serif) | Títulos, números-editoriais, citações |
| `font-sans` | **DM Sans** (fallback: system-ui) | UI, corpo de texto, labels, tabelas, botões |
| `font-brand` | **Bodoni Moda** (fallback: Didot, Times) | **Exceção de marca**: exclusivamente o wordmark “EventeIA” (tracking negativo). Nunca usar em corpo de texto ou títulos |

Carregamento: **`next/font`** (self-hosted, sem FOUT). Fraunces com eixos `opsz` + `SOFT` ativados via `font-variation-settings` quando disponíveis.

### 4.2 Escala tipográfica (canônica)

| Token | Família | Tamanho/linha | Peso | Uso |
|---|---|---|---|---|
| `display-1` | Fraunces | 64px / 1.05 · ls −0.02em | 600 | Hero, abertura editorial |
| `display-2` | Fraunces | 48px / 1.10 · ls −0.015em | 600 | Títulos de seção |
| `title-1` | Fraunces | 32px / 1.20 | 600 | Título de página do dashboard |
| `title-2` | Fraunces | 24px / 1.30 | 600 | Título de card/orçamento |
| `title-3` | DM Sans | 20px / 1.40 | 500 | Subtítulos, itens de breakdown |
| `body-lg` | DM Sans | 18px / 1.60 | 400 | Lead paragraphs |
| `body` | DM Sans | 16px / 1.60 | 400 | Corpo padrão |
| `caption` | DM Sans | 13px / 1.50 | 400 | Notas, ajuda de campo |
| `overline` | DM Sans | 12px / 1.40 · ls 0.14em | 500 (maiusculas) | Eyebrows, rótulos de tabela |

- Números monetários usam **`font-variant-numeric: tabular-nums`** (colunas alinhadas) e sempre `Intl.NumberFormat("pt-BR", { currency: "BRL" })` a partir de centavos inteiros.
- Máx. 70–75 caracteres por linha em texto corrido.

---

## 5. Monograma e marca

- **Asset oficial**: `/public/logo-e.png` — monograma “E” com acabamento metálico champagne.
- Uso:
  - Sempre via `next/image`, dimensões fixas (`width`/`height`), `alt="EventeIA"` quando sozinho; `alt=""` (decorativo) quando acompanhado do logotipo em texto.
  - Alturas canônicas: 32px (header), 40px (footer), 64px (hero).
  - ❌ Proibido: esticar, recolorir, aplicar sombras coloridas, colocar sobre `areia-secundaria` em tamanho pequeno (metálico perde definição).
  - Espaçamento mínimo ao redor: 100% da altura do monograma.
- Wordmark em texto usa Fraunces 600 com `letter-spacing: 0.02em`.
- Favicon deve derivar do mesmo PNG (otimizado), sem variação criativa.

---

## 6. Componentes — regras visuais

### 6.1 Botões

| Variante | Estilo | Estados |
|---|---|---|
| Primário | Fundo `vinho`, texto `off-white`, raio `0.75rem`, `px-6 py-3`, DM Sans 500 | hover: leve clareamento (`areia` no texto); active: translateY(1px) |
| Secundário | Borda 1.5px `champagne`, texto `vinho`, fundo transparente | hover: fundo `champagne-claro` 40% |
| Champagne | Fundo `champagne`, texto `vinho` (contraste AA) | hover: `champagne-claro` |
| Fantasma | Texto `vinho`, underline `champagne` | hover: underline `champagne-claro` |

- Foco visível sempre (anel champagne, offset 2px). Desabilitado: opacidade 40% + `cursor-not-allowed` + **não remove da tab order** (usa `aria-disabled`).
- Um único botão primário por bloco visual. CTA monetário (comprar tíquete) nunca disputa destaque com CTA de cadastro.

### 6.2 Campos (inputs)

- Fundo `off-white`, borda 1px `line.subtle`, raio `0.75rem`, altura 48px.
- Label acima (DM Sans 500, 14px) — nunca placeholder como label único.
- Foco: borda `champagne` + anel; erro: borda vermelha + mensagem `caption` abaixo com `role="alert"`.
- Moeda: campo especial com máscara BRL, sempre exibindo “R$” e preservando os centavos digitados.

### 6.3 Cards

- Fundo `off-white` sobre páginas `areia-quente`; borda 1px `line.subtle`; raio `1rem`; sombra `soft`.
- Cabeçalho do card em Fraunces (`title-2`), corpo em DM Sans.
- Card de orçamento (peça-assinatura): breakdown em tabela com linhas alternadas `areia-quente`/`areia-secundaria`, coluna de valores alinhada à direita com tabular-nums, linha “Total” em vinho com filete champagne acima.

### 6.4 Tabelas financeiras

- Cabeçalho `overline` maiúsculo, cor vinho; divisórias `line.subtle`.
- Números: Fraunces 600 para totais; DM Sans tabular-nums para linha-a-linha.
- Sem zebrado agressivo — alternância areia é suficiente; nada de bordas verticais.

### 6.5 Chips/badges de status

- Fundo `champagne-claro` 40% + texto vinho (statuses neutros); vinho + texto off-white (confirmado); `areia-secundaria` + vinho (pendente).
- Sem cores semânticas saturadas fora de erro/sucesso de validação (seção 3).

### 6.6 Feedback

- Toasts: card compacto, fundo vinho, texto off-white, ícone champagne; desaparecem em 4s com `prefers-reduced-motion` respeitado.
- Empty states: ilustração mínima + título Fraunces itálico + uma ação clara. Nunca uma tela vazia sem próximo passo.

### 6.7 Seções editoriais escuras

- Fundo vinho, texto off-white, acentos champagne/champagne-claro; usadas para depoimentos e fechamento de páginas de marketing — no máximo 1 por página.

---

## 7. Espaçamento, raio, sombra e movimento

- **Espaçamento**: escala Tailwind padrão (4px base). Respiro generoso: `py-24` em seções de marketing, `gap-6` em grids.
- **Larguras**: container de conteúdo `max-w-6xl`; texto corrido `max-w-prose` (65ch).
- **Raio**: `0.75rem` (campos/botões), `1rem` (cards). Nada acima de `1.5rem` — cantos exagerados destoam do tom editorial.
- **Sombras**: apenas `soft` e `raised` (tokens em `tailwind.config.ts`). Sem sombras coloridas.
- **Movimento**: 150–250ms, curva `cubic-bezier(0.2, 0, 0, 1)`. Animações são sutis (fade/translate 4px). `@media (prefers-reduced-motion: reduce)` desliga transformações e parallax.

---

## 8. Mapeamento para Tailwind

Os tokens acima estão implementados em [`tailwind.config.ts`](../tailwind.config.ts):

- Cores: classes `bg-vinho`, `text-champagne`, `bg-areia-quente`, `text-off-white`, `border-line-subtle`, etc.
- Tipografia: `font-serif` (Fraunces), `font-sans` (DM Sans) e escala `text-display-1` … `text-overline`.
- Sombras: `shadow-soft`, `shadow-raised`, `shadow-gold`.
- Raio: `rounded-card`, `rounded-pill`.
- Transições: `ease-editorial`.

**Regra de ouro visual**: componente novo usa **token semântico**, nunca hex cru. Um hex em JSX é um bug de design system.

---

## 10. Imagens, personagens e depoimentos

- **Público principal**: mães e famílias organizando **festas infantis** (1 aninho, 4–10 anos). O produto atende todos os eventos (15 anos, casamento, formatura, corporativo), mas a vitrine deve falar primeiro com esse público. Ilustrações e imagens infantis têm prioridade; foto de casamento/estética adulta não é o padrão.
- **Imagens**: priorizar pessoas reais vivendo o evento (diversidade de idades, corpos, cidades e portes de festa) e ilustrações próprias para o universo infantil. Evitar que a única estética seja luxo/exclusividade — a marca é sofisticada, não inacessível. Toda foto precisa de `alt` descritivo e crédito/licença registrada.
- **IA no protótipo**: imagens geradas por IA são permitidas para conceito e validação visual, sempre **sem pessoas identificáveis**, creditadas como geradas por IA e substituídas por fotos reais autorizadas antes do lançamento. Nunca usar rosto de criança gerado por IA como se fosse cliente real.
- **Personagens e depoimentos**: personas ilustrativas são apenas **fallback** até existirem casos reais. O fluxo real é: convite pós-evento (`/depoimento?token=…`) → formulário com consentimento explícito e versionado → moderação → publicação (`pnpm testimonials:publish <id>`). Com pelo menos um caso real, a nota de rodapé desaparece automaticamente e as personas saem da vitrine. Nunca publicar depoimento sem autorização registrada (LGPD).
- **Credibilidade**: cada depoimento deve trazer contexto verificável (tipo de evento, cidade, resultado concreto) e nunca prometer algo que o produto não entrega.
- Personagens não podem sugerir parceria, cargo ou empresa real sem autorização.

## 11. Checklist visual de PR

- [ ] Nenhum hex literal em componentes (apenas tokens).
- [ ] Champagne não aparece como texto pequeno sobre fundo claro.
- [ ] Foco visível em todos os interativos.
- [ ] Números monetários: `tabular-nums`, `Intl.NumberFormat`, centavos inteiros.
- [ ] Textos na voz da marca (editorial, humano, sem "!!!").
- [ ] Nenhum texto champagne sobre fundo claro; eyebrows como chip champagne-claro + vinho.
- [ ] Texto secundário com opacidade ≥ 70% sobre areia.
- [ ] Teste de contraste passa (CI Lighthouse `color-contrast`).
