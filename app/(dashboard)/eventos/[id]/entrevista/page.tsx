import Link from "next/link";
import { notFound } from "next/navigation";

import { z } from "zod";

import { EventInterview } from "@/components/domain/event-interview";
import { FollowInstagramCard } from "@/components/domain/follow-instagram-card";
import { defaultAnswers, parseAnswers } from "@/lib/catalog/rules";
import { ALL_EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/catalog/v1";
import type { EventType } from "@/lib/engine/types";
import { isEventStarted, STARTED_EVENT_LOCK_MESSAGE } from "@/lib/events/edit-lock";
import { findMunicipioByCode, resolveMunicipio } from "@/lib/geo/municipios";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EventInterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,title,event_type,guest_count,city,city_uf,city_ibge_code,search_city_codes,interview_answers,status,discovery_started_at,search_start_date")
    .eq("id", idParsed.data)
    .maybeSingle();
  if (event === null) notFound();

  // 0073: evento iniciado não reabre a entrevista.
  if (isEventStarted(event)) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-serif text-display-2 font-display">{event.title}</h1>
        <p role="note" data-testid="interview-locked" className="text-sm text-vinho/80">
          {STARTED_EVENT_LOCK_MESSAGE}
        </p>
        <Link href={`/eventos/${event.id}`} className="text-sm text-primaria underline underline-offset-4">
          Voltar ao evento
        </Link>
      </div>
    );
  }

  const typeParsed = z.enum(ALL_EVENT_TYPES as [EventType, ...EventType[]]).safeParse(event.event_type);
  if (!typeParsed.success) notFound();
  const eventType = typeParsed.data;

  const saved = event.interview_answers === null ? null : parseAnswers(eventType, event.interview_answers);
  const initialAnswers = saved !== null && saved.success ? saved.data : defaultAnswers(eventType);

  return (
    <div className="flex scroll-mt-24 flex-col gap-8">
      <header>
        <p className="text-overline uppercase tracking-[0.14em] text-vinho/75">Entrevista do evento</p>
        <h1 className="mt-2 font-serif text-display-2 font-display">{event.title}</h1>
        <p className="mt-2 text-sm text-vinho/75">
          {EVENT_TYPE_LABELS[eventType]} · {event.guest_count} convidados. Responda para o agente saber
          exatamente o que cotar — inclusive limpeza, transporte e segurança.
        </p>
        <Link href={`/eventos/${event.id}`} className="mt-3 inline-block text-sm text-primaria underline underline-offset-4">
          Voltar ao evento
        </Link>
      </header>
      <FollowInstagramCard />
      <EventInterview
        eventId={event.id}
        eventType={eventType}
        guestCount={event.guest_count}
        initialAnswers={initialAnswers}
        initialCity={resolveMunicipio({ code: event.city_ibge_code, name: event.city, uf: event.city_uf })}
        initialSearchCities={(event.search_city_codes ?? [])
          .map((code) => findMunicipioByCode(code))
          .filter((m) => m !== null)}
      />
    </div>
  );
}
