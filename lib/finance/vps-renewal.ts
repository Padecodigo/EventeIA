import { brDate, renewalStatus } from "./fixed-extras";

export interface RenewalRow {
  provider: string;
  label: string;
  runway_alert_days: number;
  renewal_date?: string | null;
  renewal_alerted_for?: string | null;
}

/** Envia o aviso de vencimento? Só quando dentro do limite de dias e ainda não avisado para ESTA data. */
export function renewalNotice(row: RenewalRow, now: Date): { send: boolean; daysLeft: number | null } {
  const st = renewalStatus(row.renewal_date ?? null, now, row.runway_alert_days);
  const send = st.alert && row.renewal_date !== null && row.renewal_date !== undefined && row.renewal_alerted_for !== row.renewal_date;
  return { send, daysLeft: st.daysLeft };
}

export function renewalEmailText(items: { label: string; renewalDate: string; daysLeft: number }[], now: Date): string {
  const fmt = (d: string) => d.split("-").reverse().join("/");
  const lines = items.map((i) =>
    `• ${i.label}: vence em ${fmt(i.renewalDate)} — ${i.daysLeft < 0 ? `venceu há ${-i.daysLeft} dia(s)` : i.daysLeft === 0 ? "vence hoje" : `faltam ${i.daysLeft} dia(s)`}`,
  );
  return `Atenção: renovação de servidor da EventeIA chegando (${fmt(brDate(now))}).\n\n${lines.join("\n")}\n\nRenove para o site não sair do ar. Depois, atualize a data em https://eventeia.com.br/admin/custos`;
}
