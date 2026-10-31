import { META_OPTIONAL_SCOPE_NOTES } from "@/lib/meta/token-health";

export interface MetaTokenStatusView {
  is_valid: boolean;
  expires_at: string | null;
  scopes: string[];
  missing_scopes: string[];
  optional_missing: string[];
  checked_at: string | null;
}

function fmtWhen(iso: string | null): string {
  if (iso === null) return "nunca verificado";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/**
 * Cartão "Token Meta" do painel de custos (server component, só apresentação).
 * Mostra validade, expiração, escopos concedidos/faltando e última verificação.
 */
export function MetaTokenCard({ status }: { status: MetaTokenStatusView | null }) {
  return (
    <section className="rounded-card border border-line-subtle bg-off-white p-5 shadow-soft" data-testid="meta-token-card">
      <h3 className="font-serif text-title-3">Token Meta</h3>
      {status === null ? (
        <p className="mt-2 text-sm text-vinho/70">Nenhuma verificação registrada ainda.</p>
      ) : (
        <dl className="mt-2 flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <dt className="font-semibold">Status:</dt>
            <dd>
              {status.is_valid ? (
                <span data-testid="meta-token-valid" className="rounded-full bg-vinho/10 px-2 text-caption font-semibold text-vinho">válido</span>
              ) : (
                <span data-testid="meta-token-invalid" className="rounded-full bg-semantic-error/15 px-2 text-caption font-semibold text-semantic-error">inválido</span>
              )}
            </dd>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <dt className="font-semibold">Expira em:</dt>
            <dd className="tabular-nums">{status.expires_at === null ? "nunca expira" : new Date(status.expires_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</dd>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <dt className="font-semibold">Escopos concedidos:</dt>
            <dd data-testid="meta-token-scopes">{status.scopes.length === 0 ? "—" : status.scopes.join(", ")}</dd>
          </div>
          {status.missing_scopes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <dt className="font-semibold text-semantic-error">Obrigatórios faltando:</dt>
              <dd data-testid="meta-token-missing" className="text-semantic-error">{status.missing_scopes.join(", ")}</dd>
            </div>
          ) : null}
          {status.optional_missing.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <dt className="font-semibold text-amber-700">Opcionais faltando:</dt>
              <dd data-testid="meta-token-optional" className="text-amber-700">
                {status.optional_missing.map((scope) => (
                  <span key={scope} className="mr-2 inline-block">
                    {scope}
                    {META_OPTIONAL_SCOPE_NOTES[scope] !== undefined ? ` (${META_OPTIONAL_SCOPE_NOTES[scope]})` : ""}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <dt className="font-semibold">Última verificação:</dt>
            <dd className="tabular-nums">{fmtWhen(status.checked_at)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
