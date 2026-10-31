# Fluxo de seleção de produtos (nível de categoria)

> Documento operacional da seleção de produtos da EventeIA. Última revisão: 2026-10-31.
> Regras de plataforma vinculantes: [AGENTS.md](../AGENTS.md) e
> [docs/canais-meta.md](./canais-meta.md). Implementação: `lib/selection/`,
> migração aditiva `0065_supplier_options.sql`.

## 1. Visão geral

A seleção acontece no **nível de categoria** (não há catálogo itemizado): cada fornecedor
registra a **categoria/tema** e uma **lista de opções** (ex.: buffet → churrasco, jantar;
louça → vários jogos). As opções são extraídas das respostas do fornecedor no chat
(o agente extrai; o admin pode editar).

- **Quem escolhe é sempre o usuário.** O sistema **nunca** pré-seleciona, marca default ou
  recomenda uma opção automaticamente.
- A escolha é enviada ao fornecedor **somente dentro da janela aberta** (send-guard), nunca
  como abordagem fria.

## 2. Modelo de dados

| Tabela | Papel |
|---|---|
| `supplier_options` | Opções oferecidas pelo fornecedor (`name`, `description`, `price_cents`, `unit`, `source_message_id`). |
| `supplier_selections` | Escolha do usuário (uma por `(event_id, supplier_id)`) com a máquina de estados. |

RLS: `supplier_options` — escrita/edição **admin**; leitura pelo **dono do evento** (fornecedor
ligado via conversa Meta, cotação ou prospecto). `supplier_selections` — escrita pelo dono/planner
do evento; leitura admin/dono.

## 3. Máquina de estados da seleção

```mermaid
stateDiagram-v2
    [*] --> pendente : usuário escolhe (ação explícita)

    pendente --> enviado_ao_fornecedor : enviar (janela aberta)
    pendente --> canal_fechado : janela_fechada
    pendente --> indisponivel : fornecedor indisponível / opt-out

    enviado_ao_fornecedor --> aguardando_resposta : entregue
    enviado_ao_fornecedor --> respondido : resposta
    enviado_ao_fornecedor --> canal_fechado : janela_fechada
    enviado_ao_fornecedor --> indisponivel : indisponivel

    aguardando_resposta --> respondido : resposta
    aguardando_resposta --> canal_fechado : janela_fechada
    aguardando_resposta --> indisponivel : indisponivel

    respondido --> [*]
    canal_fechado --> [*]
    indisponivel --> [*]
```

Estados terminais: `respondido`, `canal_fechado`, `indisponivel`. Só `pendente` é
relayável — a automação só dispara o envio a partir dele.

## 4. Sequência — janela do fornecedor (abertura e fechamento)

```mermaid
sequenceDiagram
    participant F as Fornecedor (IG/Messenger)
    participant W as Webhook Meta
    participant C as supplier_conversations
    participant S as Sweep (meta-window-sweep)

    F->>W: mensagem via ig.me/m.me (ref=event:<id>)
    W->>C: upsert (janela = 24h/7d) · status open
    C-->>W: window_expires_at

    Note over C: janela aberta — automação pode responder

    alt fornecedor responde de novo
        F->>C: last_inbound_at atualiza · janela reabre
    else janela vence sem resposta
        S->>C: status = canal_fechado
        C-->>S: usuário segue com outro fornecedor
    end
```

## 5. Sequência — conversa com o usuário final via Instagram

```mermaid
sequenceDiagram
    participant U as Usuário (site)
    participant A as Server Action
    participant B as supplier_selections
    participant G as Meta Graph API
    participant F as Fornecedor

    U->>A: escolhe opção (botão "Escolher")
    A->>A: valida evento + opção + ligação do fornecedor
    A->>B: upsert (status = pendente)
    A->>A: relayDecision (send-guard: janela + horário comercial)

    alt janela aberta e em horário comercial
        A->>G: send (RESPONSE)
        G-->>F: mensagem de escolha
        A->>B: status = enviado_ao_fornecedor · relayed_at
    else fora do horário comercial
        A->>B: status = pendente (aguarda nova tentativa)
    else janela fechada / opt-out
        A->>B: status = canal_fechado / indisponivel
    end
```

## 6. Prospecção (post) → conversa → cotações → aceite → handoff

```mermaid
sequenceDiagram
    participant IG as Instagram (post)
    participant F as Fornecedor
    participant W as Webhook Meta
    participant C as supplier_conversations
    participant AI as Agente (LLM)
    participant O as supplier_options
    participant U as Usuário
    participant Q as Cotação/Aceite

    IG->>F: post de prospecção (categoria)
    F->>IG: comenta / abre DM
    IG->>W: comentário / mensagem
    W->>C: conversa + janela (private reply 1x / DM)
    W->>AI: interpreta a resposta
    AI->>O: extrai opções (nome, preço, unidade)
    Note over AI,O: admin pode editar as opções

    U->>U: compara opções lado a lado (preço)
    U->>O: escolhe (sem pré-seleção)
    O->>C: relay dentro da janela (send-guard)
    F->>C: responde (cotação) — reabre janela
    C->>Q: cotação → aceite
    Q-->>U: handoff de contato (fechamento)
```

## 7. Regras invioláveis

1. **Sem pré-seleção**: nenhuma opção nasce marcada; não há "recomendado". Teste de regressão
   em `tests/components/supplier-options-panel.test.tsx` garante isso.
2. **Relay só na janela aberta**: `relayDecision` (send-guard) bloqueia abordagem fria, opt-out
   e horário fora do comercial (dias úteis, 09:00–18:00 America/Sao_Paulo).
3. **Nunca usar `HUMAN_AGENT`** na automação — `AUTOMATION_MESSAGING_TYPE = "RESPONSE"`.
4. **Dinheiro em centavos inteiros** (`price_cents bigint`), nunca `float`.
5. **Migração aditiva**: `0065_supplier_options.sql` não altera nem apaga dados existentes.
