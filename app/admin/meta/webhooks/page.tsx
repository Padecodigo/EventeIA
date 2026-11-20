import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { resolveMetaPageCredentials } from "@/lib/meta/connection-store";
import {
  getSubscribedFields,
  PAGE_WEBHOOK_FIELDS,
  summarizeWebhookPayload,
} from "@/lib/meta/page-webhooks";
import { listRecentMetaWebhookEvents } from "@/lib/meta/webhook-log";

import { Card } from "../../ui";
import { subscribePageAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Webhooks da Página" };

const STATUS_MESSAGES: Record<string, { label: string; tone: string }> = {
  inscrito: { label: "Campos inscritos na Página.", tone: "text-vinho" },
  erro: {
    label: "Não foi possível inscrever os campos. Tente novamente.",
    tone: "text-vinho/70",
  },
  sem_conexao: {
    label: "Conecte a Página em Conexão Meta para gerenciar os webhooks.",
    tone: "text-vinho/70",
  },
};

function firstString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function WebhooksAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const statusKey = firstString(params.status);
  const status = statusKey !== undefined ? STATUS_MESSAGES[statusKey] : undefined;

  const creds = await resolveMetaPageCredentials();

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-serif text-title-2 text-vinho">Webhooks da Página</h1>
        <p className="mt-1 text-caption text-vinho/70">
          Page webhooks — pages_manage_metadata
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/admin/meta/webhooks"
          className="rounded-full border border-line-subtle px-4 py-2 text-sm font-semibold text-vinho/70 transition hover:opacity-90"
        >
          Atualizar
          <span className="ml-1 text-caption font-normal opacity-80">(Refresh)</span>
        </Link>
        <Link
          href="/admin/meta"
          className="rounded-full border border-line-subtle px-4 py-2 text-sm font-semibold text-vinho/70 transition hover:opacity-90"
        >
          Voltar para Conexão Meta
          <span className="ml-1 text-caption font-normal opacity-80">
            (Back to Meta Connection)
          </span>
        </Link>
      </div>
    </header>
  );

  const banner =
    status !== undefined ? (
      <p
        className={`rounded-card border border-line-subtle bg-white/70 p-4 text-sm ${status.tone}`}
      >
        {status.label}
      </p>
    ) : null;

  if (creds === null) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {banner}
        <Card testId="webhooks-sem-conexao">
          <p className="text-caption uppercase tracking-wide text-vinho/60">Sem conexão</p>
          <p className="mt-2 text-sm text-vinho/70">
            Conecte a Página do Facebook para gerenciar os webhooks da Página.
          </p>
          <p className="mt-3">
            <Link
              href="/admin/meta"
              className="rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
            >
              Ir para Conexão Meta
            </Link>
          </p>
        </Card>
      </div>
    );
  }

  const env = serverEnv();
  const fieldsResult = await getSubscribedFields({
    pageId: creds.pageId,
    appId: env.META_APP_ID,
    accessToken: creds.pageAccessToken,
    apiVersion: env.META_API_VERSION,
  });

  const subscribed = fieldsResult.ok ? fieldsResult.data : [];
  const noFields = subscribed.length === 0;
  const events = await listRecentMetaWebhookEvents();

  return (
    <div className="flex flex-col gap-6">
      {header}
      {banner}

      <Card testId="webhooks-fields">
        <p className="text-caption uppercase tracking-wide text-vinho/60">
          Campos inscritos (Subscribed fields)
        </p>
        {!fieldsResult.ok ? (
          <p className="mt-2 text-sm text-vinho/70">{fieldsResult.error}</p>
        ) : noFields ? (
          <p className="mt-2 text-sm text-vinho/70">Nenhum campo inscrito</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {subscribed.map((field) => (
              <li
                key={field}
                className="rounded-full border border-line-subtle bg-white/70 px-3 py-1 text-xs font-semibold text-vinho"
              >
                {field}
              </li>
            ))}
          </ul>
        )}

        <form action={subscribePageAction} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {PAGE_WEBHOOK_FIELDS.map((field) => (
              <label key={field} className="flex items-center gap-2 text-sm text-vinho">
                <input
                  type="checkbox"
                  name="fields"
                  value={field}
                  defaultChecked={
                    subscribed.includes(field) || (noFields && (field === "messages" || field === "feed"))
                  }
                />
                {field}
              </label>
            ))}
          </div>
          <div>
            <button
              type="submit"
              className="rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
            >
              Inscrever
              <span className="ml-1 text-caption font-normal opacity-80">(Subscribe)</span>
            </button>
          </div>
        </form>
      </Card>

      <Card testId="webhooks-endpoint">
        <p className="text-caption uppercase tracking-wide text-vinho/60">Endpoint</p>
        <p className="mt-2 break-all text-sm font-semibold text-vinho">
          https://eventeia.com.br/api/meta/webhook
        </p>
        <p className="mt-2 text-sm text-vinho/70">
          Cada evento é validado pela assinatura X-Hub-Signature-256 antes de ser gravado.
        </p>
        <p className="mt-1 text-caption text-vinho/50">
          (Each event is validated by its X-Hub-Signature-256 signature before being stored.)
        </p>
      </Card>

      <Card testId="webhooks-events">
        <p className="text-caption uppercase tracking-wide text-vinho/60">
          Últimos eventos recebidos (Latest events received)
        </p>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-vinho/70">Nenhum evento recebido ainda.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm text-vinho">
              <thead>
                <tr className="border-b border-line-subtle text-caption uppercase tracking-wide text-vinho/60">
                  <th className="py-2 pr-3 font-semibold">Recebido em</th>
                  <th className="py-2 pr-3 font-semibold">Tipo</th>
                  <th className="py-2 pr-3 font-semibold">Canal</th>
                  <th className="py-2 pr-3 font-semibold">Texto</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const summary = summarizeWebhookPayload(event.summary);
                  return (
                    <tr
                      key={event.id}
                      data-testid="meta-webhook-event"
                      className="border-b border-line-subtle/60 align-top"
                    >
                      <td className="py-2 pr-3 text-caption text-vinho/70">
                        {new Date(event.receivedAt).toLocaleString("pt-BR")}
                      </td>
                      <td className="py-2 pr-3 capitalize">{summary.kind}</td>
                      <td className="py-2 pr-3">{summary.channel ?? "—"}</td>
                      <td className="py-2 pr-3">{summary.text !== "" ? summary.text : "—"}</td>
                      <td className="py-2 pr-3">
                        {event.status}
                        {event.lastError !== null ? (
                          <span className="mt-1 block text-caption text-vinho/60">
                            {event.lastError}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
