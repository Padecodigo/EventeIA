import Image from "next/image";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { resolveMetaPageCredentials } from "@/lib/meta/connection-store";
import {
  fetchPageProfile,
  listPagePosts,
  type PagePost,
  type PageProfile,
} from "@/lib/meta/page-content";

import { Card } from "../../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conteúdo da Página" };

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function formatDate(value: string | null): string {
  if (value === null) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

function PostItem({ post }: { post: PagePost }) {
  return (
    <li
      data-testid="meta-page-post"
      className="flex flex-col gap-3 rounded-card border border-line-subtle bg-white/70 p-4 sm:flex-row"
    >
      {post.fullPicture !== null ? (
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-card">
          <Image
            src={post.fullPicture}
            alt="Imagem do post"
            width={96}
            height={96}
            unoptimized
            className="h-24 w-24 object-cover"
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-vinho">
          {post.message !== null ? truncate(post.message, 280) : "(sem texto)"}
        </p>
        <p className="text-caption text-vinho/60">{formatDate(post.createdTime)}</p>
        {post.permalinkUrl !== null ? (
          <a
            href={post.permalinkUrl}
            target="_blank"
            rel="noreferrer"
            className="text-caption font-semibold text-vinho/70 underline-offset-2 hover:underline"
          >
            Ver no Facebook
          </a>
        ) : null}
      </div>
    </li>
  );
}

function PageHeader({ profile }: { profile: PageProfile }) {
  return (
    <Card testId="meta-page-header">
      <div className="flex flex-wrap items-center gap-4">
        {profile.pictureUrl !== null ? (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full">
            <Image
              src={profile.pictureUrl}
              alt={profile.name}
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16 rounded-full object-cover"
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <p className="text-title-3 font-semibold text-vinho">{profile.name}</p>
          {profile.fanCount !== null ? (
            <p className="text-caption text-vinho/60">{`${String(profile.fanCount)} seguidores`}</p>
          ) : null}
          {profile.link !== null ? (
            <a
              href={profile.link}
              target="_blank"
              rel="noreferrer"
              className="text-caption font-semibold text-vinho/70 underline-offset-2 hover:underline"
            >
              Abrir no Facebook
            </a>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-caption text-vinho/60">
        Dados lidos pela Graph API com a permissão pages_read_engagement. (Read via the Graph API.)
      </p>
    </Card>
  );
}

export default async function ConteudoPaginaAdminPage() {
  await requireAdmin();

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-serif text-title-2 text-vinho">Conteúdo da Página</h1>
        <p className="mt-1 text-caption text-vinho/70">
          Page content — pages_read_engagement
        </p>
      </div>
      <Link
        href="/admin/meta"
        className="rounded-full border border-line-subtle px-4 py-2 text-sm font-semibold text-vinho/70 transition hover:opacity-90"
      >
        Voltar para Conexão Meta
        <span className="ml-1 text-caption font-normal opacity-80">
          (Back to Meta Connection)
        </span>
      </Link>
    </header>
  );

  const creds = await resolveMetaPageCredentials();

  if (creds === null) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card testId="meta-page-sem-conexao">
          <p className="text-caption uppercase tracking-wide text-vinho/60">Sem conexão</p>
          <p className="mt-2 text-sm text-vinho/70">
            Conecte a Página do Facebook em Conexão Meta para ver o conteúdo da Página.
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

  const apiVersion = serverEnv().META_API_VERSION;
  const accessToken = creds.pageAccessToken;
  const pageId = creds.pageId;

  const [profileResult, postsResult] = await Promise.all([
    fetchPageProfile({ pageId, accessToken, apiVersion }),
    listPagePosts({ pageId, accessToken, apiVersion, limit: 10 }),
  ]);

  const headerContent = profileResult.ok ? (
    <PageHeader profile={profileResult.data} />
  ) : (
    <Card testId="meta-page-header">
      <p className="text-sm text-vinho/70">{profileResult.error}</p>
    </Card>
  );

  const postsContent = postsResult.ok ? (
    postsResult.data.length === 0 ? (
      <p className="text-sm text-vinho/70">Nenhum post encontrado.</p>
    ) : (
      <ul className="flex flex-col gap-3">
        {postsResult.data.map((post) => (
          <PostItem key={post.id} post={post} />
        ))}
      </ul>
    )
  ) : (
    <p className="text-sm text-vinho/70">{postsResult.error}</p>
  );

  return (
    <div className="flex flex-col gap-6">
      {header}
      {headerContent}
      <Card testId="meta-page-posts">
        <p className="text-caption uppercase tracking-wide text-vinho/60">
          Posts recentes (Recent posts)
        </p>
        <div className="mt-3">{postsContent}</div>
      </Card>
    </div>
  );
}
