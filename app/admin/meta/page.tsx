import Image from "next/image";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { getMetaConnectionSummary, getMetaUserToken } from "@/lib/meta/connection-store";
import { listManagedPages, type ManagedPage } from "@/lib/meta/graph-login";
import { metaLoginConfig, metaLoginEnabled } from "@/lib/meta/login-config";
import { META_LOGIN_SCOPES } from "@/lib/meta/oauth";

import { Card } from "../ui";
import { disconnectMetaAction, selectMetaPageAction } from "./actions";

export const dynamic = "force-dynamic";

/** Telas que usam a Página conectada (uma por permissão da App Review). */
const META_TOOLS = [
  {
    href: "/admin/meta/comentarios",
    label: "Comentários do post do evento",
    hint: "Event post comments — instagram_manage_comments",
  },
] as const;
export const metadata = { title: "Conexão Meta" };

const STATUS_MESSAGES: Record<string, { label: string; tone: string }> = {
  conectado: {
    label: "Login com a Meta concluído. Agora escolha a Página.",
    tone: "text-vinho",
  },
  pagina: { label: "Página conectada com sucesso.", tone: "text-vinho" },
  desconectado: { label: "Conexão com a Meta removida.", tone: "text-vinho/70" },
  cancelado: { label: "Conexão cancelada.", tone: "text-vinho/70" },
  erro_config: {
    label:
      "Login com a Meta desativado ou não configurado no servidor (META_LOGIN_ENABLED, META_APP_SECRET, META_TOKEN_ENCRYPTION_KEY).",
    tone: "text-vinho/70",
  },
  erro_troca: {
    label: "Não foi possível trocar o código por token junto à Meta.",
    tone: "text-vinho/70",
  },
  erro_gravar: {
    label: "Não foi possível salvar a conexão com a Meta.",
    tone: "text-vinho/70",
  },
  erro_pagina: {
    label: "Não foi possível selecionar a Página. Tente novamente.",
    tone: "text-vinho/70",
  },
  erro: { label: "Não foi possível conectar com a Meta.", tone: "text-vinho/70" },
};

function PagePicture({ url, name }: { url: string | null; name: string }) {
  if (url === null) return null;
  // Foto vinda do CDN da Meta: sem otimização do Next (não passa pelo /_next/image).
  return <Image src={url} alt={name} width={48} height={48} unoptimized className="rounded-full" />;
}

export default async function MetaAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ meta?: string | string[] }>;
}) {
  await requireAdmin();

  const rawStatus = (await searchParams).meta;
  const status = typeof rawStatus === "string" ? STATUS_MESSAGES[rawStatus] : undefined;

  const enabled = metaLoginEnabled();
  const summary = await getMetaConnectionSummary().catch(() => null);

  let pages: ManagedPage[] = [];
  let pagesLoadFailed = false;
  if (enabled && summary !== null && summary.pageId === null) {
    const config = metaLoginConfig();
    const token = await getMetaUserToken().catch(() => null);
    if (config === null || token === null) {
      pagesLoadFailed = true;
    } else {
      const result = await listManagedPages({ userToken: token, apiVersion: config.apiVersion });
      if (result.ok) {
        pages = result.data;
      } else {
        pagesLoadFailed = true;
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-title-2 text-vinho">Conexão Meta</h1>
          <p className="mt-1 text-caption text-vinho/70">
            Meta connection — Facebook Login for Business
          </p>
          <p className="mt-2 text-sm text-vinho/70">
            A automação do EventeIA usa apenas a Página do Facebook do próprio EventeIA e a conta
            profissional do Instagram vinculada a ela.
          </p>
        </div>
        {enabled ? (
          <Link
            href="/meta/connect"
            data-testid="meta-continue-facebook"
            className="rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
          >
            Continuar com o Facebook
            <span className="ml-1 text-caption font-normal opacity-80">
              (Continue with Facebook)
            </span>
          </Link>
        ) : null}
      </header>

      {status !== undefined ? (
        <p
          className={`rounded-card border border-line-subtle bg-white/70 p-4 text-sm ${status.tone}`}
        >
          {status.label}
        </p>
      ) : null}

      <Card testId="meta-tools">
        <p className="text-caption uppercase tracking-wide text-vinho/60">Ferramentas (Tools)</p>
        <ul className="mt-2 space-y-1 text-sm">
          {META_TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link href={tool.href} className="font-semibold text-vinho underline-offset-2 hover:underline">
                {tool.label}
              </Link>
              <span className="ml-2 text-caption text-vinho/60">{tool.hint}</span>
            </li>
          ))}
        </ul>
      </Card>

      {!enabled ? (
        <Card testId="meta-login-disabled">
          <p className="text-caption uppercase tracking-wide text-vinho/60">
            Login com a Meta desativado
          </p>
          <p className="mt-2 text-sm text-vinho/70">
            O login com a Meta está desligado no servidor (flag META_LOGIN_ENABLED). Ative a flag e
            configure as credenciais para habilitar a conexão. Nenhuma ação está disponível
            enquanto o recurso estiver desativado.
          </p>
        </Card>
      ) : null}

      {enabled && summary !== null && summary.pageId !== null ? (
        <Card testId="meta-page-connected">
          <p className="text-caption uppercase tracking-wide text-vinho/60">Página conectada</p>
          <div className="mt-3 flex items-center gap-3">
            <PagePicture
              url={summary.pagePictureUrl}
              name={summary.pageName ?? "Página do Facebook"}
            />
            <div>
              <p className="text-sm font-semibold text-vinho/80">
                Página conectada: {summary.pageName ?? "—"}
              </p>
              <p className="text-caption text-vinho/60">(Page connected)</p>
            </div>
          </div>

          <p className="mt-3 text-sm text-vinho/70">
            {summary.igUsername !== null
              ? `Instagram: @${summary.igUsername}`
              : "Nenhuma conta do Instagram ligada a esta Página"}
          </p>

          <p className="mt-1 text-caption text-vinho/60">
            Conectado por {summary.fbUserName ?? summary.fbUserId}
          </p>

          <div className="mt-4">
            <p className="text-caption uppercase tracking-wide text-vinho/60">Permissões</p>
            <ul className="mt-2 space-y-1 text-sm text-vinho/70">
              {META_LOGIN_SCOPES.map((scope) => {
                const granted = summary.scopes.includes(scope);
                return (
                  <li key={scope}>
                    {granted ? `✓ ${scope}` : `✗ ${scope} (não concedida)`}
                  </li>
                );
              })}
            </ul>
          </div>

          <form action={disconnectMetaAction} className="mt-4">
            <button
              type="submit"
              className="rounded-full border border-line-subtle px-4 py-2 text-sm font-semibold text-vinho/70 transition hover:opacity-90"
            >
              Desconectar
            </button>
          </form>
        </Card>
      ) : null}

      {enabled && summary !== null && summary.pageId === null ? (
        <Card testId="meta-page-picker">
          <p className="text-caption uppercase tracking-wide text-vinho/60">
            Escolha a Página (Select a Page)
          </p>
          {pagesLoadFailed ? (
            <p className="mt-2 text-sm text-vinho/70">
              Não foi possível carregar as Páginas. Reconecte com a Meta para continuar.
            </p>
          ) : pages.length === 0 ? (
            <p className="mt-2 text-sm text-vinho/70">
              Nenhuma Página disponível. Reconecte com a Meta para continuar.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {pages.map((page) => (
                <li
                  key={page.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-3"
                >
                  <div className="flex items-center gap-3">
                    <PagePicture url={page.pictureUrl} name={page.name} />
                    <div>
                      <p className="text-sm font-semibold text-vinho/80">{page.name}</p>
                      <p className="text-caption text-vinho/60">
                        {page.igUsername !== null
                          ? `Instagram: @${page.igUsername}`
                          : "sem Instagram ligado"}
                      </p>
                    </div>
                  </div>
                  <form action={selectMetaPageAction}>
                    <input type="hidden" name="pageId" value={page.id} />
                    <button
                      type="submit"
                      className="rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
                    >
                      Usar esta Página
                      <span className="ml-1 text-caption font-normal opacity-80">
                        (Use this Page)
                      </span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {enabled && summary === null ? (
        <Card>
          <p className="mt-1 text-sm text-vinho/70">
            Nenhuma conta conectada. Clique em “Continuar com o Facebook”.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
