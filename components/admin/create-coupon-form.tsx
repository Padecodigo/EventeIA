"use client";

import { useActionState } from "react";

import { createCouponAction, type CouponAdminState } from "@/app/admin/cupons/actions";
import { Button } from "@/components/ui/button";

const initialState: CouponAdminState = {};

export function CreateCouponForm() {
  const [state, formAction, pending] = useActionState(createCouponAction, initialState);

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="coupon-code" className="text-sm font-medium text-vinho">
          Código
        </label>
        <input
          id="coupon-code"
          name="code"
          required
          minLength={2}
          maxLength={24}
          placeholder="FESTA10"
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm uppercase text-vinho"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="coupon-type" className="text-sm font-medium text-vinho">
          Tipo de desconto
        </label>
        <select
          id="coupon-type"
          name="discountType"
          defaultValue="percent"
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        >
          <option value="percent">Percentual (%)</option>
          <option value="fixed_cents">Valor fixo (centavos)</option>
          <option value="free">Cortesia — gratuidade total (1 uso se sem limite)</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="coupon-value" className="text-sm font-medium text-vinho">
          Valor
        </label>
        <input
          id="coupon-value"
          name="value"
          type="number"
          required
          min={1}
          placeholder="10 (percentual) ou 1500 (R$ 15,00)"
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        />
        <p className="text-caption text-vinho/70">
          Percentual até 90 · fixo em centavos até 100000 (R$ 1.000,00). O preço final nunca fica
          abaixo do custo operacional.
          Cortesia ignora o valor (informe 1) e libera o evento sem cobrança.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="coupon-max" className="text-sm font-medium text-vinho">
          Limite de usos (opcional)
        </label>
        <input
          id="coupon-max"
          name="maxUses"
          type="number"
          min={1}
          placeholder="500"
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="coupon-expires" className="text-sm font-medium text-vinho">
          Válido até (opcional)
        </label>
        <input
          id="coupon-expires"
          name="expiresAt"
          type="date"
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        />
      </div>

      <div className="flex items-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Criando…" : "Criar cupom"}
        </Button>
      </div>

      {state.error !== undefined ? (
        <p role="alert" className="md:col-span-2 rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}

      {state.success === true ? (
        <p className="md:col-span-2 rounded-xl bg-semantic-success/10 px-4 py-3 text-sm text-semantic-success">
          Cupom criado e ativo — já pode ser usado no checkout.
        </p>
      ) : null}
    </form>
  );
}
