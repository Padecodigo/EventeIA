import Link from "next/link";

import { formatSignupDate, instagramLabel, loadRecentSignups, signupDbFrom } from "@/lib/admin/signups";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { Card, READ_ONLY_NOTE } from "../ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Cadastros recentes" };

export default async function AdminCadastrosPage() {
  const rows = await loadRecentSignups(signupDbFrom(getSupabaseAdmin()));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-serif text-title-2">Cadastros recentes</h2>
        <p className="text-caption text-vinho/60">
          Últimos 100 cadastros, do mais novo para o mais antigo. Use a coluna Instagram para seguir de volta.{" "}
          {READ_ONLY_NOTE}
        </p>
      </header>
      <Card testId="recent-signups">
        {rows.length === 0 ? (
          <p className="text-caption text-vinho/70">Nenhum cadastro encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2 [&_th]:font-medium">
              <thead className="text-left text-caption text-vinho/60">
                <tr>
                  <th>Nome</th>
                  <th>Instagram</th>
                  <th>Último evento</th>
                  <th>Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-line-subtle">
                    <td className="font-semibold">{row.displayName}</td>
                    <td>{instagramLabel(row.instagramHandle)}</td>
                    <td>
                      {row.latestEvent ? (
                        <Link className="underline" href={`/admin/eventos/${row.latestEvent.id}`}>
                          {row.latestEvent.title}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{formatSignupDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
