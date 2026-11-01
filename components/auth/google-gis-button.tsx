"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";

import { useEffect, useRef, useState } from "react";

import { signInWithGoogleIdTokenAction } from "@/app/(auth)/actions";
import {
  GIS_LOAD_TIMEOUT_MS,
  GOOGLE_GIS_SCRIPT_SRC,
  createGoogleNonce,
  gisButtonWidth,
  googleWebClientId,
} from "@/lib/auth/google-gis";

interface GisCredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  prompt: () => void;
  cancel: () => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

/**
 * Botão oficial "Entrar com Google" (Google Identity Services) + One Tap no login.
 * Se o script do Google não carregar (bloqueador, rede, timeout), chama
 * `onUnavailable` e o formulário mostra o fluxo OAuth antigo como alternativa.
 */
export function GoogleGisButton({
  intent,
  acceptedTerms,
  onUnavailable,
  onError,
}: {
  intent: "signin" | "signup";
  acceptedTerms: boolean;
  onUnavailable: () => void;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(
    () => typeof window !== "undefined" && window.google?.accounts?.id !== undefined,
  );
  const [pending, setPending] = useState(false);
  const termsRef = useRef(acceptedTerms);
  termsRef.current = acceptedTerms;

  const clientId = googleWebClientId();

  useEffect(() => {
    if (clientId === null) onUnavailable();
  }, [clientId, onUnavailable]);

  useEffect(() => {
    if (scriptLoaded || clientId === null) return;
    const timer = window.setTimeout(() => {
      if (window.google?.accounts?.id === undefined) onUnavailable();
    }, GIS_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [scriptLoaded, clientId, onUnavailable]);

  useEffect(() => {
    const gis = window.google?.accounts?.id;
    const container = containerRef.current;
    if (!scriptLoaded || clientId === null || gis === undefined || container === null) return;
    let cancelled = false;

    void createGoogleNonce().then(({ nonce, hashedNonce }) => {
      if (cancelled) return;
      gis.initialize({
        client_id: clientId,
        nonce: hashedNonce,
        use_fedcm_for_prompt: true,
        auto_select: false,
        cancel_on_tap_outside: true,
        context: intent === "signup" ? "signup" : "signin",
        ux_mode: "popup",
        callback: (response: GisCredentialResponse) => {
          if (response.credential === undefined) return;
          setPending(true);
          void signInWithGoogleIdTokenAction({
            credential: response.credential,
            nonce,
            intent,
            acceptedTerms: termsRef.current,
          }).then((result) => {
            if (result.redirectTo !== undefined) {
              router.replace(result.redirectTo);
              router.refresh();
              return;
            }
            setPending(false);
            onError(result.error ?? "Não foi possível entrar com Google. Tente novamente.");
          });
        },
      });
      container.replaceChildren();
      gis.renderButton(container, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "pill",
        text: intent === "signup" ? "signup_with" : "continue_with",
        logo_alignment: "center",
        locale: "pt-BR",
        width: gisButtonWidth(container.clientWidth),
      });
      if (intent === "signin") gis.prompt();
    });

    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel();
    };
  }, [scriptLoaded, clientId, intent, router, onError]);

  if (clientId === null) return null;

  return (
    <div data-testid="google-gis">
      <Script
        src={GOOGLE_GIS_SCRIPT_SRC}
        strategy="afterInteractive"
        onReady={() => setScriptLoaded(true)}
        onError={onUnavailable}
      />
      <div
        ref={containerRef}
        data-testid="google-gis-button"
        aria-busy={pending}
        className="flex min-h-[44px] w-full justify-center"
      />
      {pending ? (
        <p className="mt-2 text-center text-caption text-vinho/70" role="status">
          Entrando com Google…
        </p>
      ) : null}
    </div>
  );
}
