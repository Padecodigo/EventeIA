import type { SupplierCandidate } from "../pure";

export interface DiscoveryQuery {
  category: string;
  categoryLabel: string;
  city: string;
  eventTypeLabel: string;
  /** Texto livre (demanda específica) quando category = "outros". */
  freeText?: string;
  limit: number;
  /** Telefones/nomes já conhecidos — o provedor deve trazer fornecedores NOVOS. */
  exclude: string[];
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Provedor plugável de descoberta. Novos provedores (ex.: DeepSeek) só implementam isto. */
export interface DiscoveryProvider {
  readonly name: string;
  /** Roteadores (ex.: Grok→NIM) informam qual provedor atendeu a última busca. */
  readonly lastUsed?: string;
  search(query: DiscoveryQuery): Promise<SupplierCandidate[]>;
}

/** Cota/crédito esgotado ou rate limit (429/402/403) — dispara o fallback. */
export class ProviderQuotaError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
  ) {
    super(`${provider} sem cota (HTTP ${String(status)})`);
    this.name = "ProviderQuotaError";
  }
}
