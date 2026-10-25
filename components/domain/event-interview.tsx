"use client";

import { useActionState, useMemo, useState } from "react";

import {
  saveInterviewAction,
  type InterviewState,
} from "@/app/(dashboard)/eventos/[id]/entrevista/actions";
import { CityPicker, type Municipio } from "@/components/domain/city-picker";
import { SearchCitiesPicker } from "@/components/domain/search-cities-picker";
import { Button } from "@/components/ui/button";
import { resolveRequirements, visibleQuestions, type Answers } from "@/lib/catalog/rules";
import { formatSchedule } from "@/lib/catalog/time";
import {
  CATEGORY_LABELS,
  STEPS,
  UNIT_LABELS,
  type AnswerValue,
  type Question,
} from "@/lib/catalog/v1";
import type { EventType } from "@/lib/engine/types";

const initialState: InterviewState = {};

export interface EventInterviewProps {
  eventId: string;
  eventType: EventType;
  guestCount: number;
  initialAnswers: Answers;
  /** Município do evento (IBGE) para pré-preencher; null se ainda não há (ou legado sem match). */
  initialCity: Municipio | null;
  /** Cidades extras de busca já salvas. */
  initialSearchCities?: Municipio[];
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  const labelId = `q-${question.id}`;
  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border border-line-subtle bg-white/60 p-4">
      <legend id={labelId} className="px-1 text-sm font-medium text-vinho">
        {question.label}
      </legend>
      {question.hint !== undefined ? <p className="text-caption text-vinho/70">{question.hint}</p> : null}
      {question.kind === "boolean" ? (
        <div className="flex gap-2" role="radiogroup" aria-labelledby={labelId}>
          {[true, false].map((opt) => (
            <button
              key={String(opt)}
              type="button"
              role="radio"
              aria-checked={value === opt}
              onClick={() => onChange(opt)}
              className={`rounded-pill px-5 py-2 text-sm transition ${
                value === opt
                  ? "bg-primaria text-white"
                  : "border border-vinho/15 bg-off-white text-vinho hover:border-primaria/40"
              }`}
            >
              {opt ? "Sim" : "Não"}
            </button>
          ))}
        </div>
      ) : question.kind === "single" ? (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={labelId}>
          {question.options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={value === o.value}
              onClick={() => onChange(o.value)}
              className={`rounded-pill px-4 py-2 text-sm transition ${
                value === o.value
                  ? "bg-primaria text-white"
                  : "border border-vinho/15 bg-off-white text-vinho hover:border-primaria/40"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : question.kind === "time" ? (
        <input
          type="time"
          aria-labelledby={labelId}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-40 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        />
      ) : question.kind === "text" ? (
        <textarea
          aria-labelledby={labelId}
          maxLength={question.maxLength}
          rows={4}
          value={typeof value === "string" ? value : ""}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-xl border border-line-subtle bg-off-white px-4 py-3 text-sm text-vinho placeholder:text-vinho/60"
        />
      ) : (
        <input
          type="number"
          aria-labelledby={labelId}
          min={question.min}
          max={question.max}
          value={typeof value === "number" ? value : question.defaultValue}
          onChange={(e) => onChange(Math.trunc(Number(e.target.value)))}
          className="h-12 w-32 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        />
      )}
    </fieldset>
  );
}

export function EventInterview({
  eventId,
  eventType,
  guestCount,
  initialAnswers,
  initialCity,
  initialSearchCities = [],
}: EventInterviewProps) {
  const [state, formAction, pending] = useActionState(saveInterviewAction, initialState);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [eventCity, setEventCity] = useState<Municipio | null>(initialCity);
  const [searchCities, setSearchCities] = useState<Municipio[]>(initialSearchCities);
  const [step, setStep] = useState(0);

  const visible = useMemo(() => visibleQuestions(eventType, answers), [eventType, answers]);
  const requirements = useMemo(
    () => resolveRequirements(eventType, guestCount, answers),
    [eventType, guestCount, answers],
  );
  const city = eventCity === null ? "" : `${eventCity.name} – ${eventCity.uf}`;
  const extraCities = searchCities.filter((m) => m.code !== eventCity?.code);
  const totalSteps = STEPS.length + 1; // + revisão
  const isReview = step === STEPS.length;
  const current = STEPS[step];

  const setAnswer = (id: string, v: AnswerValue) => setAnswers((prev) => ({ ...prev, [id]: v }));

  return (
    <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
      <ol className="flex flex-wrap gap-2" aria-label="Etapas da entrevista">
        {[...STEPS.map((s) => s.title), "Revisão"].map((title, i) => (
          <li key={title}>
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={`rounded-pill px-4 py-1.5 text-caption transition ${
                i === step
                  ? "bg-vinho text-white"
                  : i < step
                    ? "bg-areia-secundaria text-vinho"
                    : "border border-vinho/15 text-vinho/70"
              }`}
            >
              {i + 1}. {title}
            </button>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-caption text-vinho/70">
        Etapa {step + 1} de {totalSteps}
      </p>

      {!isReview && current !== undefined ? (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <h2 className="font-serif text-title-2">{current.title}</h2>
            <p className="mt-1 text-sm text-vinho/75">{current.description}</p>
          </div>

          {current.code === "local" ? (
            <div className="flex flex-col gap-4 rounded-xl border border-line-subtle bg-white/60 p-4">
              <CityPicker name="" label="Cidade da festa" initial={initialCity} onChange={setEventCity} />
              <p className="text-caption text-vinho/70">
                Buscamos fornecedores nesta cidade. Se quiser, adicione cidades vizinhas abaixo.
              </p>
              <SearchCitiesPicker eventCity={eventCity} value={extraCities} onChange={setSearchCities} />
            </div>
          ) : null}

          {visible
            .filter((q) => q.step === current.code)
            .map((q) => (
              <QuestionField key={q.id} question={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
            ))}
        </div>
      ) : (
        <div className="mt-4">
          <h2 className="font-serif text-title-2">O que vamos cotar</h2>
          <p className="mt-1 text-sm text-vinho/75">
            {city === "" ? "Informe a cidade na primeira etapa." : `Em ${city}, para ${guestCount} convidados.`}
            {extraCities.length > 0
              ? ` Também buscaremos fornecedores em ${extraCities.map((m) => `${m.name} – ${m.uf}`).join(", ")}.`
              : null}
            {typeof answers.horario_inicio === "string" && typeof answers.horario_fim === "string"
              ? ` Festa ${formatSchedule(answers.horario_inicio, answers.horario_fim)}.`
              : null}
          </p>
          <ul className="mt-4 divide-y divide-line-subtle rounded-xl border border-line-subtle bg-white/60">
            {requirements.map((r) => (
              <li key={r.itemCode} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium text-vinho">{r.label}</span>
                  <span className="block text-caption text-vinho/70">{CATEGORY_LABELS[r.category]}</span>
                  {r.notes !== undefined ? (
                    <span className="mt-1 block whitespace-pre-wrap text-caption italic text-vinho/80">“{r.notes}”</span>
                  ) : null}
                </span>
                <span className="text-right text-caption text-vinho/75">
                  {r.quantity} {UNIT_LABELS[r.unit]}
                  {r.mandatory ? <span className="ml-2 rounded-pill bg-champagne/40 px-2 py-0.5">essencial</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.error !== undefined ? (
        <p role="alert" className="mt-4 rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}

      <form action={formAction} className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="cityCode" value={eventCity?.code ?? ""} />
        <input type="hidden" name="searchCityCodes" value={extraCities.map((m) => m.code).join(",")} />
        <input type="hidden" name="answers" value={JSON.stringify(answers)} />
        <Button type="button" variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Voltar
        </Button>
        {isReview ? (
          <Button type="submit" variant="primary" disabled={pending || eventCity === null}>
            {pending ? "Salvando…" : "Concluir entrevista"}
          </Button>
        ) : (
          <Button type="button" variant="primary" onClick={() => setStep((s) => s + 1)}>
            Continuar
          </Button>
        )}
      </form>
    </section>
  );
}
