import Link from "next/link";

import { ADMIN_NAV } from "@/lib/admin/nav";

export const metadata = { title: "Admin" };

export default function AdminIndexPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-title-1">Administração</h1>
      <p className="text-sm text-vinho/70">Área restrita da equipe: dinheiro, custos, uso de IA, cupons, depoimentos e atendimento. Escolha uma seção.</p>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_NAV.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-card border border-line-subtle bg-white/70 p-5 transition hover:border-primaria/40"
            >
              <span className="font-semibold">{item.label}</span>
              <p className="mt-1 text-sm opacity-75">{item.description}</p>
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/painel"
            className="block rounded-card border border-line-subtle bg-white/70 p-5 transition hover:border-primaria/40"
          >
            <span className="font-semibold">Painel do usuário</span>
            <p className="mt-1 text-sm opacity-75">Eventos, créditos e perfil.</p>
          </Link>
        </li>
      </ul>
    </div>
  );
}
