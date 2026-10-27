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

export function socialContactUrl(sourceUrl: string): SocialContact | null {
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
      return { platform: "instagram", label: "Instagram DM", url: `https://ig.me/m/${handle}` };
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
