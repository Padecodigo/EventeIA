import { CreateCouponForm } from "@/components/admin/create-coupon-form";
import { WelcomeStats } from "@/components/admin/welcome-stats";
import { requireAdmin } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWelcomeAdmin } from "@/lib/welcome/admin";

import { toggleCouponAction } from "./actions";

export const metadata = {
  title: "Cupons",
  robots: { index: false, follow: false },
};

interface CouponRow {
  id: string;
  code: string;
  discount_type: "percent" | "fixed_cents" | "free";
  value: number;
  active: boolean;
  expires_at: string | null;
  max_redemptions: number | null;
  redemptions: number;
  created_at: string;
}

function describeDiscount(row: CouponRow): string {
  if (row.discount_type === "free") return "Cortesia (grátis)";
  return row.discount_type === "percent"
    ? `${String(row.value)}%`
    : formatBRL(row.value);
}

export default async function AdminCouponsPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("coupons")
    .select(
      "id,code,discount_type,value,active,expires_at,max_redemptions,redemptions,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const coupons = data ?? [];
  const welcome = await loadWelcomeAdmin();
  const activeCount = coupons.filter((coupon) => coupon.active).length;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-3 font-serif text-display-2 font-display">Cupons de desconto.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-vinho/75">
          Cupons aplicam-se ao tíquete B2C (R$ 97). Redenção só conta quando o Pix é confirmado; o
          preço final nunca fica abaixo do piso de R$ 47 (exceto cortesia).
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-caption">
          <span className="rounded-full bg-vinho px-3 py-1 text-off-white">
            {String(activeCount)} ativo(s)
          </span>
          <span className="rounded-full bg-areia-secundaria px-3 py-1 text-vinho/75">
            {String(coupons.length)} no total
          </span>
        </div>
      </header>

      {error !== null ? (
        <p className="rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error">
          Não foi possível carregar os cupons: {error.message}
        </p>
      ) : null}

      <WelcomeStats data={welcome} />

      <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
        <h2 className="font-serif text-title-2">Novo cupom</h2>
        <div className="mt-5">
          <CreateCouponForm />
        </div>
      </section>

      <section className="rounded-card border border-line-subtle bg-off-white shadow-soft">
        <header className="border-b border-line-subtle px-6 py-5">
          <h2 className="font-serif text-title-2">Catálogo</h2>
        </header>

        {coupons.length === 0 ? (
          <p className="px-6 py-6 text-sm text-vinho/75">Nenhum cupom criado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-overline uppercase tracking-[0.12em] text-vinho/70">
                  <th className="px-6 py-3 font-medium">Código</th>
                  <th className="px-6 py-3 font-medium">Desconto</th>
                  <th className="px-6 py-3 text-right font-medium">Usos</th>
                  <th className="px-6 py-3 font-medium">Válido até</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(coupons as CouponRow[]).map((coupon) => (
                  <tr key={coupon.id} className="border-t border-line-subtle even:bg-areia-quente/60">
                    <td className="px-6 py-3 font-semibold uppercase text-vinho">{coupon.code}</td>
                    <td className="px-6 py-3 text-vinho/75">{describeDiscount(coupon)}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-vinho/75">
                      {String(coupon.redemptions)}
                      {coupon.max_redemptions !== null ? ` / ${String(coupon.max_redemptions)}` : ""}
                    </td>
                    <td className="px-6 py-3 text-caption text-vinho/70">
                      {coupon.expires_at !== null
                        ? new Date(coupon.expires_at).toLocaleDateString("pt-BR")
                        : "sem prazo"}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`rounded-pill px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                          coupon.active ? "bg-vinho text-off-white" : "bg-areia-secundaria text-vinho/70"
                        }`}
                      >
                        {coupon.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <form action={toggleCouponAction}>
                        <input type="hidden" name="couponId" value={coupon.id} />
                        <input
                          type="hidden"
                          name="activate"
                          value={coupon.active ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          className="rounded-full border border-line-strong px-4 py-2 text-caption text-vinho/80 transition hover:bg-areia-quente"
                        >
                          {coupon.active ? "Desativar" : "Reativar"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
