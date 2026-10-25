import { WhatsappSetup } from "@/components/domain/whatsapp-setup";

export interface ProspectRow {
  id: string;
  vendor_name: string;
  vendor_category: string;
  phone_e164: string;
  status: "pending" | "sent" | "replied" | "opt_out" | "failed";
  created_at: string;
}

const statusLabels: Record<string, string> = {
  pending: "Na fila",
  sent: "Enviado",
  replied: "Respondeu",
  opt_out: "Recusou (opt-out)",
  failed: "Falhou",
};

const statusClasses: Record<string, string> = {
  pending: "bg-areia-secundaria text-vinho/75",
  sent: "bg-vinho text-off-white",
  replied: "bg-champagne-claro/70 text-vinho",
  opt_out: "bg-semantic-error/10 text-semantic-error",
  failed: "bg-semantic-error/10 text-semantic-error",
};

export function ProspectingPanel({
  eventId,
  prospects,
  instanceStatus,
  numberMode = null,
  connection,
}: {
  eventId: string;
  prospects: readonly ProspectRow[];
  instanceStatus: string | null;
  numberMode?: "dedicated" | "personal" | null;
  connection?: { connected: boolean; showDisconnectedAlert: boolean; phone: string | null };
}) {
  const connected =
    connection?.connected ?? (instanceStatus === "active" || instanceStatus === "draining");
  const showAlert = connection?.showDisconnectedAlert ?? instanceStatus === "disconnected";
  return (
    <section className="rounded-card border border-line-subtle bg-off-white shadow-soft">
      <header className="border-b border-line-subtle px-6 py-5">
        <h2 className="font-serif text-title-1">Agente Orçamentista</h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-vinho/75">
          O primeiro contato sai pelo <strong>seu WhatsApp</strong>: texto puro, sem links, com
          intervalo humanizado de 45 a 90 segundos entre disparos. Se o fornecedor recusar
          (&ldquo;sair&rdquo;, &ldquo;parar&rdquo;), os envios param imediatamente.
        </p>
      </header>

      {showAlert ? (
        <p
          role="alert"
          className="mx-6 mt-5 rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error"
        >
          Seu WhatsApp está desconectado. Reconecte a sessão para retomar os disparos — a fila
          continua pausada até a conexão voltar.
        </p>
      ) : null}

      {prospects.length > 0 ? (
        <ul className="flex flex-col gap-2 px-6 py-5">
          {prospects.map((prospect) => (
            <li
              key={prospect.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line-subtle bg-areia-quente px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-vinho">{prospect.vendor_name}</p>
                <p className="text-caption text-vinho/70">
                  {prospect.vendor_category} · {prospect.phone_e164}
                </p>
              </div>
              <span
                className={`rounded-pill px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusClasses[prospect.status] ?? ""}`}
              >
                {statusLabels[prospect.status] ?? prospect.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {connected ? (
        <div className="border-t border-line-subtle px-6 py-6">
          <p
            role="status"
            data-testid="whatsapp-connected"
            className="inline-flex items-center gap-2 rounded-xl bg-champagne-claro/70 px-4 py-3 text-sm font-medium text-vinho"
          >
            ✓ Conectado{connection?.phone ? ` — WhatsApp ${connection.phone}` : ""}
          </p>
        </div>
      ) : (
        <div className="border-t border-line-subtle px-6 py-6">
          <h3 className="font-serif text-title-3">Conectar WhatsApp</h3>
          <p className="mt-1 max-w-prose text-sm leading-6 text-vinho/75">
            O agente encontra fornecedores na cidade da festa sozinho — você não precisa cadastrar
            ninguém. Escolha qual número ele usa para os contatos.
          </p>
          <div className="mt-4">
            <WhatsappSetup eventId={eventId} current={numberMode} connected={false} />
          </div>
        </div>
      )}
    </section>
  );
}
