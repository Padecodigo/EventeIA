/**
 * Contato por redes sociais a partir do perfil salvo em `suppliers.source_url`.
 *
 * Conformidade: aqui não há automação nem envio automático — apenas o deep link
 * que ABRE o perfil (ou a DM, no Instagram) no app/navegador do próprio usuário.
 * Quem dispara a primeira mensagem é a pessoa, respeitando a plataforma.
 */

export type SocialPlatform = "instagram" | "facebook" | "tiktok";

export interface SocialContact {
  platform: SocialPlatform;
  /** Rótulo para a interface. */
  label: string;
  /** URL que abre o perfil — no Instagram, a DM (`ig.me/m/<handle>`). */
  url: string;
}

/**
 * Primeira mensagem genérica para o contato manual. É um ponto de partida: o
 * usuário vê o texto pré-preenchido na DM e pode editar antes de enviar. Ajuste
 * aqui quando a copy mudar.
 */
export const SOCIAL_FIRST_CONTACT =
  "Olá! Aqui é da EventeIA. Vi o perfil de vocês e gostaria de pedir um orçamento para um evento. Podem me ajudar?";

export function socialContactUrl(sourceUrl: string, message?: string): SocialContact | null {
  let u: URL;
  try {
    u = new URL(sourceUrl);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const first = u.pathname.split("/").filter((segment) => segment.length > 0)[0];

  // Segmentos que não são perfil (posts, busca, login, stories…).
  const NON_PROFILE = /^(p|reel|reels|explore|stories|accounts|login|search|hashtag|tag|share|watch|groups|events|video)$/i;
  if (first !== undefined && NON_PROFILE.test(first)) {
    return null;
  }

  if (host === "instagram.com" && first !== undefined) {
    const handle = first.replace(/^@/, "");
    if (handle.length > 0) {
      const query = message !== undefined && message.trim().length > 0 ? `?text=${encodeURIComponent(message)}` : "";
      return { platform: "instagram", label: "Instagram DM", url: `https://ig.me/m/${handle}${query}` };
    }
  }

  if (host === "facebook.com" || host === "fb.com" || host === "m.me") {
    return { platform: "facebook", label: "Facebook", url: sourceUrl };
  }

  if (host === "tiktok.com" && first !== undefined) {
    const handle = first.replace(/^@/, "");
    if (handle.length > 0) {
      return { platform: "tiktok", label: "TikTok", url: `https://www.tiktok.com/@${handle}` };
    }
  }

  return null;
}
