import { CAPTION } from "@/lib/meta/limits";

/**
 * Conteúdo do post de isca: prompt visual (SDXL) e legenda com CTA, menções e
 * o aviso de imagem ilustrativa. Puro e determinístico: a mesma entrada gera o
 * mesmo texto, e `variant` escolhe uma das aberturas para variar entre posts.
 */

export interface ContentInput {
  category: string;
  city?: string;
  guestCount?: number;
  /** Palavra-chave que o fornecedor comenta (ex.: COTAÇÃO). */
  keyword: string;
  /** @handles dos fornecedores do lote. */
  handles: readonly string[];
  /** Varia a abertura entre posts (0, 1, 2…). */
  variant?: number;
}

const OPENERS = [
  "Organizando um evento e precisa de fornecedores de {category}?",
  "Vai montar um evento e quer cotar {category} sem dor de cabeça?",
  "Buscando {category} para o seu evento?",
  "Quer comparar {category} para o seu evento com calma?",
] as const;

const DISCLOSURE = "Imagens ilustrativas.";

function categoryPhrase(category: string): string {
  return category.trim().toLowerCase() || "fornecedores";
}

export function buildImagePrompt(input: {
  category: string;
  city?: string;
  guestCount?: number;
  variant?: number;
}): string {
  const category = categoryPhrase(input.category);
  const where = input.city !== undefined && input.city.trim().length > 0 ? ` em ${input.city.trim()}` : "";
  const guests =
    input.guestCount !== undefined && input.guestCount > 0 ? ` para ${String(input.guestCount)} convidados` : "";
  const scene = (input.variant ?? 0) % 2 === 0 ? "ambiente decorado, luz natural" : "mesa posta, detalhes em close";
  return `fotografia profissional de ${category}${where}${guests}, ${scene}, estilo editorial, alta qualidade, foco no produto, sem texto, sem números, sem preços, sem logotipos, sem marca d'água`;
}

export function buildCaption(input: ContentInput): string {
  const category = categoryPhrase(input.category);
  const variants = OPENERS.length;
  const opener = OPENERS[Math.abs(input.variant ?? 0) % variants].replace("{category}", category);
  const keyword = input.keyword.trim().toUpperCase();
  const handles = input.handles
    .map((handle) => `@${handle.replace(/^@/, "")}`)
    .slice(0, CAPTION.maxMentions - 1);
  const mentions = handles.length > 0 ? `\n\nFornecedores do lote: ${handles.join(" ")}` : "";
  const cta = `\n\nComente ${keyword} e nosso assistente virtual envia o pedido por DM.${mentions}\n\n${DISCLOSURE}`;
  return `${opener}${cta}`;
}

export interface PostContent {
  imagePrompt: string;
  caption: string;
}

export function buildPostContent(input: ContentInput): PostContent {
  return {
    imagePrompt: buildImagePrompt(input),
    caption: buildCaption(input),
  };
}

/** Texto de abertura da DM enviada como private reply a um comentário. */
export const PRIVATE_REPLY_OPENER =
  "Olá! Vi seu comentário. Já te chamo por aqui para entender o pedido.";
