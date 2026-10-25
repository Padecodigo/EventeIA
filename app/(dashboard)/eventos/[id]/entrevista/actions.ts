"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { parseAnswers, resolveRequirements } from "@/lib/catalog/rules";
import { ALL_EVENT_TYPES, CATALOG_VERSION } from "@/lib/catalog/v1";
import { kickoffDiscovery } from "@/lib/discovery/kickoff-runtime";
import type { EventType } from "@/lib/engine/types";
import { findMunicipioByCode, parseSearchCityCodes } from "@/lib/geo/municipios";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface InterviewState {
  error?: string;
}

const inputSchema = z.object({
  eventId: z.string().uuid(),
  cityCode: z.coerce.number().int().min(1000000).max(9999999),
  searchCityCodes: z.string().max(200).optional(),
  answers: z.string().max(8_000),
});

export async function saveInterviewAction(
  _previous: InterviewState,
  formData: FormData,
): Promise<InterviewState> {
  await requireUser();

  const parsed = inputSchema.safeParse({
    eventId: formData.get("eventId"),
    cityCode: formData.get("cityCode") || undefined,
    searchCityCodes: formData.get("searchCityCodes") ?? undefined,
    answers: formData.get("answers"),
  });
  if (!parsed.success) {
    return { error: "Escolha a cidade da festa na lista e responda as perguntas." };
  }
  const municipio = findMunicipioByCode(parsed.data.cityCode);
  if (municipio === null) {
    return { error: "Escolha a cidade da festa na lista." };
  }
  const searchCityCodes = parseSearchCityCodes(parsed.data.searchCityCodes, municipio.code);

  let rawAnswers: unknown;
  try {
    rawAnswers = JSON.parse(parsed.data.answers);
  } catch {
    return { error: "Respostas inválidas. Recarregue a página e tente novamente." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,event_type,guest_count")
    .eq("id", parsed.data.eventId)
    .maybeSingle();
  if (event === null) {
    return { error: "Evento não encontrado." };
  }

  const eventType = z
    .enum(ALL_EVENT_TYPES as [EventType, ...EventType[]])
    .safeParse(event.event_type);
  if (!eventType.success) {
    return { error: "Tipo de evento não suportado." };
  }

  const answers = parseAnswers(eventType.data, rawAnswers);
  if (!answers.success) {
    return { error: answers.error };
  }

  const requirements = resolveRequirements(eventType.data, event.guest_count, answers.data);
  const now = new Date().toISOString();

  const { error: upsertError } = await supabase.from("event_requirements").upsert(
    requirements.map((r) => ({
      event_id: event.id,
      catalog_version: CATALOG_VERSION,
      category: r.category,
      item_code: r.itemCode,
      label: r.label,
      unit: r.unit,
      quantity: r.quantity,
      mandatory: r.mandatory,
      notes: r.notes ?? null,
      selected: true,
      updated_at: now,
    })),
    { onConflict: "event_id,item_code" },
  );
  if (upsertError !== null) {
    logger.error({ code: upsertError.code }, "falha ao salvar requisitos");
    return { error: "Não foi possível salvar a entrevista. Tente novamente." };
  }

  // Itens que saíram da entrevista: desmarca (sem DELETE, histórico preservado).
  const codes = requirements.map((r) => r.itemCode);
  const deselect = supabase
    .from("event_requirements")
    .update({ selected: false, updated_at: now })
    .eq("event_id", event.id);
  const { error: deselectError } =
    codes.length > 0 ? await deselect.not("item_code", "in", `(${codes.join(",")})`) : await deselect;
  if (deselectError !== null) {
    logger.error({ code: deselectError.code }, "falha ao desmarcar requisitos");
    return { error: "Não foi possível salvar a entrevista. Tente novamente." };
  }

  const { error: eventError } = await supabase
    .from("events")
    .update({
      city: municipio.name,
      city_uf: municipio.uf,
      city_ibge_code: municipio.code,
      search_city_codes: searchCityCodes.length > 0 ? searchCityCodes : null,
      interview_answers: answers.data, interview_completed_at: now,
    })
    .eq("id", event.id);
  if (eventError !== null) {
    logger.error({ code: eventError.code }, "falha ao concluir entrevista");
    return { error: "Não foi possível salvar a entrevista. Tente novamente." };
  }

  // Evento já pago + entrevista concluída ⇒ começa a buscar fornecedores na cidade.
  await kickoffDiscovery(event.id);

  revalidatePath(`/eventos/${event.id}`);
  redirect(`/eventos/${event.id}`);
}
