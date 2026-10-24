import Link from "next/link";
import { notFound } from "next/navigation";

import { z } from "zod";

import { EventInterview } from "@/components/domain/event-interview";
import { defaultAnswers, parseAnswers } from "@/lib/catalog/rules";
import { ALL_EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/catalog/v1";
import type { EventType } from "@/lib/engine/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EventInterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,title,event_type,guest_count,city,interview_answers")
    .eq("id", idParsed.data)
    .maybeSingle();
  if (event === null) notFound();

  const typeParsed = z.enum(ALL_EVENT_TYPES as [EventType, ...EventType[]]).safeParse(event.event_type);
  if (!typeParsed.success) notFound();
  const eventType = typeParsed.data;

  const saved = event.interview_answers === null ? null : parseAnswers(eventType, event.interview_answers);
  const initialAnswers = saved !== null && saved.success ? saved.data : defaultAnswers(eventType);

  return (
    <div className="flex flex-col gap-8">
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
      <EventInterview
        eventId={event.id}
        eventType={eventType}
        guestCount={event.guest_count}
        initialAnswers={initialAnswers}
        initialCity={event.city ?? ""}
      />
    </div>
  );
}
