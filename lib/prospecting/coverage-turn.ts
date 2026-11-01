import { logger } from "@/lib/logger";
import type { ScopeItem } from "@/lib/quotes/scope-items";

import type { AgentMessage } from "./agent";
import {
  applyClassification,
  awaitingAnswer,
  buildClassifierMessages,
  buildCoverageQuestion,
  markAsked,
  needsAsking,
  parseClassification,
  seedCoverage,
  type CoverageRow,
} from "./coverage-loop";
import type { RespondPorts } from "./respond";

/** Persistência e classificador do loop de cobertura (injetáveis nos testes). */
export interface CoveragePorts {
  /** Cobertura da cotação mais recente da conversa, ou null. */
  load(conversationId: string): Promise<{ quoteId: string; rows: CoverageRow[] } | null>;
  latestQuoteId(conversationId: string): Promise<string | null>;
  save(quoteId: string, conversationId: string, rows: readonly CoverageRow[]): Promise<void>;
  /** Saída crua do LLM classificador. */
  classify(messages: { role: "system" | "user"; content: string }[]): Promise<string>;
  now(): Date;
}

/** Texto do fornecedor desde a última mensagem nossa (a resposta à pergunta). */
function lastSupplierTurn(history: readonly AgentMessage[]): string {
  const out: string[] = [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const m = history[i];
    if (m === undefined || m.role !== "user") break;
    out.unshift(m.content);
  }
  return out.join("\n");
}

async function classifyInto(
  ports: CoveragePorts,
  rows: CoverageRow[],
  items: readonly ScopeItem[],
  text: string,
): Promise<CoverageRow[]> {
  if (items.length === 0 || text.trim() === "") return rows;
  try {
    const raw = await ports.classify(buildClassifierMessages(items, text));
    return applyClassification(rows, parseClassification(raw, items), ports.now().toISOString());
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : "?" }, "cobertura: classificador falhou — itens seguem unknown");
    return rows;
  }
}

/**
 * Envolve as portas de resposta: (1) antes do agente, classifica a resposta do
 * fornecedor às perguntas pendentes; (2) ao enviar a resposta do agente, anexa
 * UMA pergunta agrupada com os itens ainda incertos (máx. 2 rodadas).
 */
export async function withCoverageLoop(input: {
  ports: RespondPorts;
  coverage: CoveragePorts;
  conversationId: string;
  category: string;
  history: readonly AgentMessage[];
}): Promise<RespondPorts> {
  const { coverage, conversationId } = input;
  let state = await coverage.load(conversationId);
  let answeredNow = false;

  if (state !== null) {
    const pending = awaitingAnswer(state.rows);
    if (pending.length > 0) {
      const rows = await classifyInto(coverage, state.rows, pending, lastSupplierTurn(input.history));
      // Resposta recebida (mesmo vaga): registra para a próxima rodada.
      const nowIso = coverage.now().toISOString();
      const final = rows.map((r) => (pending.includes(r.itemCode) ? { ...r, answeredAt: nowIso } : r));
      await coverage.save(state.quoteId, conversationId, final);
      state = { quoteId: state.quoteId, rows: final };
      answeredNow = true;
    }
  }

  let quoteSaved = false;

  return {
    ...input.ports,
    async saveQuote(id, supplierId, quote) {
      await input.ports.saveQuote(id, supplierId, quote);
      quoteSaved = true;
    },
    async sendReply(id, text) {
      let target = state;
      if (quoteSaved) {
        const quoteId = await coverage.latestQuoteId(conversationId);
        if (quoteId !== null && (target === null || target.quoteId !== quoteId)) {
          // Nova cotação na mesma conversa herda o que já foi perguntado/respondido
          // (evita reiniciar as 2 rodadas a cada re-cotação).
          const previous = target?.rows ?? [];
          const seeded = seedCoverage(input.category).map(
            (r) => previous.find((p) => p.itemCode === r.itemCode) ?? r,
          );
          const supplierText = input.history.filter((m) => m.role === "user").map((m) => m.content).join("\n");
          const rows = await classifyInto(coverage, seeded, seeded.filter(needsAsking).map((r) => r.itemCode), supplierText);
          target = { quoteId, rows };
          await coverage.save(quoteId, conversationId, rows);
        }
      } else if (!answeredNow) {
        target = null; // só pergunta de novo logo após uma resposta do fornecedor
      }

      const ask = target === null ? [] : target.rows.filter(needsAsking).map((r) => r.itemCode);
      if (target === null || ask.length === 0) return input.ports.sendReply(id, text);

      const round = Math.max(...target.rows.filter((r) => ask.includes(r.itemCode)).map((r) => r.roundsAsked)) + 1;
      const sent = await input.ports.sendReply(id, `${text}\n\n${buildCoverageQuestion(ask, round)}`);
      if (sent) {
        const rows = markAsked(target.rows, ask, coverage.now().toISOString());
        await coverage.save(target.quoteId, conversationId, rows);
        state = { quoteId: target.quoteId, rows };
      }
      return sent;
    },
  };
}
