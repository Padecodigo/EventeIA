import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { listTiktokAccounts, type TiktokConnectedAccount } from "@/lib/tiktok/store";

import { Card, READ_ONLY_NOTE } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "TikTok" };

const STATUS_MESSAGES: Record<string, { label: string; tone: string }> = {
  conectado: { label: "Conta TikTok conectada com sucesso.", tone: "text-vinho" },
  cancelado: { label: "Conexão cancelada.", tone: "text-vinho/70" },
  erro_config: {
    label: "TikTok não configurado: adicione as credenciais do ambiente ativo no servidor.",
    tone: "text-vinho/70",
  },
  erro_troca: { label: "Não foi possível trocar o código por token.", tone: "text-vinho/70" },
  erro_gravar: { label: "Não foi possível salvar a conta conectada.", tone: "text-vinho/70" },
  erro: { label: "Não foi possível conectar a conta TikTok.", tone: "text-vinho/70" },
};

function statusLine(account: TiktokConnectedAccount): string {
  if (account.expires_at === null) return "Conectado";
  return new Date(account.expires_at).getTime() > Date.now() ? "Conectado" : "Expirado";
}

export default async function TiktokAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tiktok?: string | string[] }>;
}) {
  await requireAdmin();
  const accounts = await listTiktokAccounts();
  const rawStatus = (await searchParams).tiktok;
  const status = typeof rawStatus === "string" ? STATUS_MESSAGES[rawStatus] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-title-2 text-vinho">TikTok</h1>
          <p className="mt-1 text-caption text-vinho/70">
            Contas conectadas via Login Kit. Publicação em rascunho (inbox) apenas — um humano revisa antes de publicar.
          </p>
        </div>
        <Link
          href="/tiktok/connect"
          className="rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
        >
          Conectar conta
        </Link>
      </header>

      {status !== undefined ? (
        <p className={`rounded-card border border-line-subtle bg-white/70 p-4 text-sm ${status.tone}`}>
          {status.label}
        </p>
      ) : null}

      <Card>
        <p className="text-caption uppercase tracking-wide text-vinho/60">Contas conectadas</p>
        {accounts.length === 0 ? (
          <p className="mt-3 text-sm text-vinho/60">
            Nenhuma conta conectada. Clique em “Conectar conta” para autorizar o TikTok.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-caption uppercase tracking-wide text-vinho/50">
                  <th className="py-2">Conta</th>
                  <th className="py-2">Open ID</th>
                  <th className="py-2">Ambiente</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-t border-line-subtle">
                    <td className="py-2 text-vinho/80">{account.display_name ?? "—"}</td>
                    <td className="py-2 font-mono text-xs text-vinho/70">{account.open_id}</td>
                    <td className="py-2 text-vinho/80">{account.environment}</td>
                    <td className="py-2 text-vinho/80">{statusLine(account)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-caption text-vinho/50">{READ_ONLY_NOTE}</p>
      </Card>
    </div>
  );
}
