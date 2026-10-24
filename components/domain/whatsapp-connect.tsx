"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  requestWhatsappPairingAction,
  whatsappConnectionStateAction,
} from "@/app/(dashboard)/eventos/whatsapp-actions";
import { Button } from "@/components/ui/button";
import {
  CONNECTION_POLL_INTERVAL_MS,
  PAIRING_STEPS,
  WHATSAPP_FALLBACK_URL,
  WHATSAPP_OPEN_URL,
  isMobileUserAgent,
  parsePairingPhone,
} from "@/lib/whatsapp/pairing";

interface Pairing {
  pairingCode: string | null;
  qrDataUrl: string | null;
  expiresAt: number;
}

/**
 * Conexão do WhatsApp do cliente:
 * - desktop: QR code + código de pareamento;
 * - celular: código + botão que abre o WhatsApp e o passo a passo (não dá para
 *   escanear um QR no próprio aparelho).
 * Detecção por user agent; antes da hidratação, fallback responsivo (CSS).
 */
export function WhatsappConnect({ eventId }: { eventId: string }) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [mobile, setMobile] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const coarse =
      typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches;
    setMobile(isMobileUserAgent(navigator.userAgent) || coarse);
  }, []);

  const request = useCallback(
    (value: string) => {
      setError(null);
      setCopied(false);
      startTransition(async () => {
        const result = await requestWhatsappPairingAction(eventId, value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (result.connected) {
          setConnected(true);
          return;
        }
        setPairing({
          pairingCode: result.pairingCode,
          qrDataUrl: result.qrDataUrl,
          expiresAt: result.expiresAt,
        });
        setNow(Date.now());
      });
    },
    [eventId],
  );

  // Countdown do código.
  useEffect(() => {
    if (pairing === null || connected) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pairing, connected]);

  // Polling do estado da conexão.
  useEffect(() => {
    if (pairing === null || connected) return;
    const id = setInterval(() => {
      void whatsappConnectionStateAction(eventId).then((r) => {
        if (r.state === "open") setConnected(true);
      });
    }, CONNECTION_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pairing, connected, eventId]);

  const secondsLeft =
    pairing === null ? 0 : Math.max(0, Math.ceil((pairing.expiresAt - now) / 1000));
  const expired = pairing !== null && secondsLeft === 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (parsePairingPhone(phone) === null) {
      setError("Número inválido. Use DDD + número (ex.: 11 99999-9999) ou +código do país.");
      return;
    }
    request(phone);
  }

  async function copy() {
    if (pairing === null || pairing.pairingCode === null) return;
    try {
      await navigator.clipboard.writeText(pairing.pairingCode.replace("-", ""));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (connected) {
    return (
      <p role="status" className="rounded-xl bg-champagne-claro/70 px-4 py-3 text-sm text-vinho">
        WhatsApp conectado! O agente já pode enviar os contatos pelo seu número.
      </p>
    );
  }

  // null = ainda não hidratou: mostra ambos e deixa o CSS decidir.
  const showQr = mobile === null ? "hidden md:block" : mobile ? "hidden" : "block";
  const showOpenApp = mobile === null ? "md:hidden" : mobile ? "" : "hidden";

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
        <label className="flex flex-1 flex-col gap-1 text-sm text-vinho">
          Número do WhatsApp que será conectado
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            name="phone"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-xl border border-line-subtle bg-off-white px-3 py-2"
          />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Gerando…" : pairing === null ? "Gerar código" : "Gerar novo código"}
        </Button>
      </form>

      {error !== null ? (
        <p role="alert" className="text-sm text-semantic-error">
          {error}
        </p>
      ) : null}

      {pairing !== null ? (
        <div className="grid gap-4 md:grid-cols-2">
          {pairing.qrDataUrl !== null ? (
            <div className={showQr} data-testid="qr-block">
              <p className="text-sm font-medium text-vinho">Escaneie o QR code</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pairing.qrDataUrl}
                alt="QR code para conectar o WhatsApp"
                className="mt-2 h-56 w-56 rounded-xl bg-white p-2"
              />
              <p className="mt-2 text-caption text-vinho/70">
                No celular: WhatsApp › Aparelhos conectados › Conectar um aparelho.
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            {pairing.pairingCode !== null ? (
              <>
                <p className="text-sm font-medium text-vinho">Ou use o código de pareamento</p>
                <div className="flex items-center gap-3">
                  <code
                    data-testid="pairing-code"
                    className="rounded-xl bg-areia-quente px-4 py-2 font-mono text-2xl tracking-[0.2em] text-vinho"
                  >
                    {pairing.pairingCode}
                  </code>
                  <Button type="button" onClick={() => void copy()} disabled={expired}>
                    {copied ? "Copiado!" : "Copiar código"}
                  </Button>
                </div>
              </>
            ) : null}

            <p className="text-caption text-vinho/70" aria-live="polite">
              {expired ? "O código expirou." : `O código expira em ${String(secondsLeft)}s.`}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => request(phone)}
                disabled={pending}
              >
                Atualizar código
              </button>
            </p>

            <div className={showOpenApp}>
              <a
                href={WHATSAPP_OPEN_URL}
                className="inline-flex rounded-pill bg-vinho px-4 py-2 text-sm font-medium text-off-white"
                onClick={() => void copy()}
              >
                Abrir o WhatsApp
              </a>
              <a
                href={WHATSAPP_FALLBACK_URL}
                className="ml-3 text-caption underline"
                target="_blank"
                rel="noreferrer"
              >
                Não abriu? Tente por aqui
              </a>
            </div>

            <ol className="list-decimal pl-5 text-sm leading-6 text-vinho/80">
              {PAIRING_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-caption text-vinho/60" role="status">
              Aguardando a conexão…
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
