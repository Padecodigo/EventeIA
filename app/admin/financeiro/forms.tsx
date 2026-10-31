"use client";

import { useActionState } from "react";

import { PRICE_KEYS } from "@/lib/finance/pricing";

import { addFixedCostAction, setFxAction, setPriceAction, type FinanceActionState } from "./actions";

const input = "rounded-full border border-line-subtle bg-off-white px-3 py-2 text-sm";
const button = "rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-on-primary transition hover:bg-primaria-escura disabled:opacity-50";

function Status({ state }: { state: FinanceActionState }) {
  if (state.error) return <p role="alert" className="text-caption text-semantic-error">{state.error}</p>;
  if (state.success) return <p className="text-caption text-vinho/70">{state.success}</p>;
  return null;
}

export function FinanceForms({ month, today }: { month: string; today: string }) {
  const [fixed, fixedAction, fixedPending] = useActionState(addFixedCostAction, {});
  const [fx, fxAction, fxPending] = useActionState(setFxAction, {});
  const [price, priceAction, pricePending] = useActionState(setPriceAction, {});
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <form action={fixedAction} className="flex flex-col gap-2 rounded-card border border-line-subtle bg-off-white p-5">
        <h3 className="font-serif text-title-3">Custo fixo mensal</h3>
        <p className="text-caption text-vinho/60">Assinaturas e mensalidades (VPS, Supabase, domínio…). Valor real da fatura.</p>
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">Fornecedor<select name="provider" className={input} aria-label="Fornecedor">
          <option value="vps">VPS</option>
          <option value="supabase">Supabase</option>
          <option value="domain">Domínio</option>
          <option value="resend">Resend</option>
          <option value="serper">Serper</option>
          <option value="google_places">Google Places</option>
          <option value="deepseek">DeepSeek</option>
          <option value="other">Outros</option>
        </select><span className="font-normal text-vinho/60">quem cobrou</span></label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">Mês<input name="month" type="month" defaultValue={month} className={input} aria-label="Mês" /><span className="font-normal text-vinho/60">mês de referência</span></label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">Valor em US$<input name="usd" placeholder="US$ (ex.: 12,50)" className={input} aria-label="Valor em US$" required /><span className="font-normal text-vinho/60">valor da fatura em dólar</span></label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">Câmbio<input name="fx" placeholder="Câmbio R$/US$ (ex.: 5,60)" className={input} aria-label="Câmbio" required /><span className="font-normal text-vinho/60">quantos R$ vale US$ 1</span></label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">Observação<input name="note" placeholder="Observação" className={input} aria-label="Observação" maxLength={300} /><span className="font-normal text-vinho/60">opcional</span></label>
        <button className={button} disabled={fixedPending}>Lançar</button>
        <Status state={fixed} />
      </form>
      <form action={fxAction} className="flex flex-col gap-2 rounded-card border border-line-subtle bg-off-white p-5">
        <h3 className="font-serif text-title-3">Câmbio do dia</h3>
        <p className="text-caption text-vinho/60">Usado para converter custos em dólar para reais a partir desta data.</p>
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">Data<input name="date" type="date" defaultValue={today} className={input} aria-label="Data" /><span className="font-normal text-vinho/60">dia da cotação</span></label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">Câmbio<input name="fx" placeholder="R$ por US$ (ex.: 5,60)" className={input} aria-label="Câmbio" required /><span className="font-normal text-vinho/60">quantos R$ vale US$ 1</span></label>
        <button className={button} disabled={fxPending}>Salvar câmbio</button>
        <Status state={fx} />
      </form>
      <form action={priceAction} className="flex flex-col gap-2 rounded-card border border-line-subtle bg-off-white p-5">
        <h3 className="font-serif text-title-3">Tabela de preços</h3>
        <p className="text-caption text-vinho/60">Preço de referência usado nas estimativas por chamada. Vale para os próximos lançamentos.</p>
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">Item<select name="key" className={input} aria-label="Item">
          {PRICE_KEYS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select><span className="font-normal text-vinho/60">qual preço atualizar</span></label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-vinho/80">Preço em US$<input name="usd" placeholder="US$ por 1M tokens / 1000 req." className={input} aria-label="Preço em US$" required /><span className="font-normal text-vinho/60">por 1M tokens (IA) ou por 1000 chamadas</span></label>
        <button className={button} disabled={pricePending}>Atualizar preço</button>
        <Status state={price} />
      </form>
    </div>
  );
}
