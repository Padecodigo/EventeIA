/**
 * Login com Google via Google Identity Services (botão oficial / One Tap).
 * O Google devolve um ID token emitido para eventeia.com.br e o app troca esse
 * token por uma sessão com `supabase.auth.signInWithIdToken` — assim a tela de
 * consentimento não mostra mais o domínio do Supabase.
 *
 */
export const GOOGLE_GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/**
 * ID do cliente OAuth Web (público) em NEXT_PUBLIC_GOOGLE_CLIENT_ID — o mesmo
 * cliente configurado no provider Google do Supabase. Sem ele, o formulário usa
 * o fluxo OAuth antigo (redirect) como antes.
 */
export function googleWebClientId(
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  },
): string | null {
  const id = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";
  return /^[\w-]+\.apps\.googleusercontent\.com$/.test(id) ? id : null;
}

/** Tempo máximo para o script do Google carregar antes de cair no fluxo OAuth antigo. */
export const GIS_LOAD_TIMEOUT_MS = 5000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Nonce conforme a doc do Supabase: o Google recebe o SHA-256 (hex) do nonce
 * e o Supabase recebe o nonce cru, que ele mesmo hasheia para comparar.
 */
export async function createGoogleNonce(
  cryptoImpl: Crypto = globalThis.crypto,
): Promise<{ nonce: string; hashedNonce: string }> {
  const nonce = toHex(cryptoImpl.getRandomValues(new Uint8Array(32)));
  const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  return { nonce, hashedNonce: toHex(new Uint8Array(digest)) };
}

/** Largura do botão oficial: ocupa o contêiner no celular, limitado a 400 px (máximo do GIS). */
export function gisButtonWidth(containerWidth: number): number {
  return Math.max(200, Math.min(400, Math.floor(containerWidth)));
}
