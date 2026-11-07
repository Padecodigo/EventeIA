import { z } from "zod";

/**
 * Estado por canal de uma publicação social. É persistido em JSON tipado
 * (`prospecting_posts.image_params.publication` e, após a migração,
 * `prospect_posts.publication`).
 *
 * "uncertain"/"in_flight" NUNCA são republicados às cegas: exigem
 * reconciliação humana/operacional.
 */
export type ChannelState =
  | { kind: "pending" }
  | { kind: "in_flight" }
  | { kind: "published"; id: string }
  | { kind: "failed"; error: string }
  | { kind: "manual_removal"; link: string | null }
  | { kind: "uncertain"; reason: string }
  | { kind: "removed" };

export type PublicationChannel = "instagram" | "facebook";

export interface PublicationState {
  version: 1;
  instagram: ChannelState;
  facebook: ChannelState;
}

const channelStateSchema: z.ZodType<ChannelState> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pending") }),
  z.object({ kind: z.literal("in_flight") }),
  z.object({ kind: z.literal("published"), id: z.string().min(1) }),
  z.object({ kind: z.literal("failed"), error: z.string() }),
  z.object({ kind: z.literal("manual_removal"), link: z.string().nullable() }),
  z.object({ kind: z.literal("uncertain"), reason: z.string() }),
  z.object({ kind: z.literal("removed") }),
]);

const publicationStateSchema = z.object({
  version: z.literal(1),
  instagram: channelStateSchema,
  facebook: channelStateSchema,
});

export function initialPublicationState(): PublicationState {
  return { version: 1, instagram: { kind: "pending" }, facebook: { kind: "pending" } };
}

export function isChannelSettled(state: ChannelState): boolean {
  return state.kind === "published" || state.kind === "removed";
}

export const LEGACY_MANUAL_REMOVAL_PREFIX = "manual_removal_required:";

export interface PublicationRefInput {
  igMediaId?: string | null;
  fbPostId?: string | null;
  state?: PublicationState | null;
  error?: string | null;
}

/**
 * Predicado único (TS) que espelha public.event_publication_has_refs no SQL.
 * Qualquer divergência aqui pode apagar uma linha com ref remota.
 */
export function publicationHasRefs(input: PublicationRefInput): boolean {
  const ig = (input.igMediaId ?? "").trim();
  const fb = (input.fbPostId ?? "").trim();
  if (ig.length > 0 || fb.length > 0) return true;
  if ((input.error ?? "").startsWith(LEGACY_MANUAL_REMOVAL_PREFIX)) return true;
  if (input.state !== undefined && input.state !== null) {
    const hasStateRef = (channel: ChannelState): boolean =>
      channel.kind !== "pending" && channel.kind !== "removed";
    if (hasStateRef(input.state.instagram) || hasStateRef(input.state.facebook)) return true;
  }
  return false;
}

export function hasRemotePublicationRefs(state: PublicationState): boolean {
  const channelHasRefs = (channel: ChannelState): boolean =>
    channel.kind === "published" ||
    channel.kind === "in_flight" ||
    channel.kind === "uncertain" ||
    channel.kind === "manual_removal";
  return channelHasRefs(state.instagram) || channelHasRefs(state.facebook);
}

export function sameChannelState(left: ChannelState, right: ChannelState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isChannelBlocked(state: ChannelState): boolean {
  return (
    state.kind === "in_flight" || state.kind === "uncertain" || state.kind === "manual_removal"
  );
}

/** Parse defensivo de JSON externo/antigo; null = sem estado tipado. */
export function parsePublicationState(value: unknown): PublicationState | null {
  const parsed = publicationStateSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return null;
}

interface LegacyPublication {
  igMediaId?: unknown;
  fbPostId?: unknown;
  browserPermalink?: unknown;
  manualRemovalRequired?: unknown;
}

const legacySchema = z
  .object({
    igMediaId: z.string().nullable().optional(),
    fbPostId: z.string().nullable().optional(),
    browserPermalink: z.string().nullable().optional(),
    manualRemovalRequired: z.boolean().optional(),
  })
  .passthrough();

/** Converte o JSON legado (ids soltos / browser) para o modelo tipado. */
export function publicationStateFromLegacy(value: unknown): PublicationState {
  const parsed = legacySchema.safeParse(value);
  if (!parsed.success) return initialPublicationState();
  const legacy = parsed.data as LegacyPublication;
  const ig =
    typeof legacy.igMediaId === "string" && legacy.igMediaId.length > 0
      ? ({ kind: "published", id: legacy.igMediaId } as const)
      : legacy.manualRemovalRequired === true || typeof legacy.browserPermalink === "string"
        ? ({
            kind: "manual_removal",
            link: typeof legacy.browserPermalink === "string" ? legacy.browserPermalink : null,
          } as const)
        : ({ kind: "pending" } as const);
  const fb =
    typeof legacy.fbPostId === "string" && legacy.fbPostId.length > 0
      ? ({ kind: "published", id: legacy.fbPostId } as const)
      : ({ kind: "pending" } as const);
  return { version: 1, instagram: ig, facebook: fb };
}

export function stateFromPublicationColumn(value: unknown): PublicationState {
  return parsePublicationState(value) ?? publicationStateFromLegacy(value);
}

export function stateFromImageParams(value: unknown): PublicationState {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return initialPublicationState();
  }
  const publication = (value as { publication?: unknown }).publication;
  return parsePublicationState(publication) ?? publicationStateFromLegacy(publication);
}

export function withPublicationState(
  imageParams: unknown,
  state: PublicationState,
): Record<string, unknown> {
  const base =
    imageParams !== null &&
    imageParams !== undefined &&
    typeof imageParams === "object" &&
    !Array.isArray(imageParams)
      ? (imageParams as Record<string, unknown>)
      : {};
  return { ...base, publication: state };
}

export function setChannelState(
  state: PublicationState,
  channel: PublicationChannel,
  next: ChannelState,
): PublicationState {
  return { ...state, [channel]: next };
}
