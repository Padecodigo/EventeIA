import { WelcomeCountdown } from "@/components/domain/welcome-countdown";

export interface OfferBannerProps {
  headline: string;
  remainingMs: number;
  /** Linha opcional com o efeito no item do checkout (ex.: "Neste pacote: R$ 137,90"). */
  detail?: string;
}

/** Faixa honesta da oferta pessoal: benefício real + prazo real (relógio do banco). */
export function OfferBanner({ headline, remainingMs, detail }: OfferBannerProps) {
  if (remainingMs <= 0) return null;
  return (
    <div role="status" className="rounded-xl bg-vinho px-4 py-3 text-sm text-off-white">
      <p>
        {headline} — termina em{" "}
        <WelcomeCountdown remainingMs={remainingMs} format="dhms" className="text-champagne" />
      </p>
      {detail !== undefined ? <p className="mt-1 text-off-white/85">{detail}</p> : null}
      <p className="mt-1 text-caption text-off-white/70">
        Aplicada automaticamente na sua primeira compra elegível. Uso único; não acumula com outro
        cupom (vale o maior desconto).
      </p>
    </div>
  );
}
